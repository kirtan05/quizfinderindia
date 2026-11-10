import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractQuizFromMessage } from './extractor.js';
import { isDuplicate, findSimilarQuiz } from './dedup.js';
import { addQuiz, markSourceItemProcessed, setInstagramLastFetch } from '../store.js';
import { resolveCity } from '../utils/cities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_PATH = path.join(__dirname, 'instagram', 'scraper.py');
const PAGES_PATH = path.join(__dirname, 'instagram', 'pages.json');
const POSTERS_DIR = path.join(__dirname, '..', '..', 'data', 'posters');
// Prefer the project's own virtualenv (uv venv .venv && uv pip install instaloader)
const VENV_PYTHON = path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
const PYTHON = existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

/** What the last scrape managed, for callers that need more than the quiz list. */
export const lastRun = { pagesTotal: 0, pagesDone: 0, blocked: false, nextOffset: 0 };

async function downloadPoster(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!existsSync(POSTERS_DIR)) mkdirSync(POSTERS_DIR, { recursive: true });
    const file = `${randomUUID()}.jpg`;
    writeFileSync(path.join(POSTERS_DIR, file), Buffer.from(await res.arrayBuffer()));
    return file;
  } catch (err) {
    console.log(`  Failed to download image: ${err.message}`);
    return null;
  }
}

/**
 * Check if python3 and instaloader are available.
 * Returns true if both are installed.
 */
function checkDependencies() {
  try {
    const result = spawnSync(PYTHON, ['-c', 'import instaloader'], { stdio: 'pipe' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Run the Python scraper and return parsed JSON output.
 */
function runScraper(loginUsername, offset) {
  const args = [SCRAPER_PATH, '--pages', PAGES_PATH, '--no-download', '--offset', String(offset || 0)];

  if (loginUsername) {
    args.push('--login', loginUsername);
  }

  console.log(`Running Instagram scraper...`);

  const result = spawnSync(PYTHON, args, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 1_500_000, // 25 minutes
    stdio: ['pipe', 'pipe', 'inherit'], // stderr goes to console
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Scraper exited with code ${result.status}`);

  return JSON.parse(result.stdout);
}

/**
 * Sync Instagram: scrape pages, extract quizzes, deduplicate, store.
 * @returns {Array} Array of newly added quiz objects.
 */
export async function syncInstagram({ offset = 0 } = {}) {
  // Check pages.json exists and has entries
  if (!existsSync(PAGES_PATH)) {
    console.log('Instagram: no pages.json found — skipping.');
    return [];
  }

  const pages = JSON.parse(readFileSync(PAGES_PATH, 'utf-8'));
  if (!Array.isArray(pages) || pages.length === 0) {
    console.log('Instagram: no pages configured — skipping.');
    return [];
  }

  // Check dependencies
  if (!checkDependencies()) {
    console.log('Instagram: python3 or instaloader not installed — skipping.');
    console.log('  Install with: uv venv .venv && uv pip install --python .venv/bin/python instaloader');
    return [];
  }

  const loginUsername = process.env.INSTAGRAM_USERNAME || null;
  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;

  // Run Python scraper
  let scraperOutput;
  try {
    scraperOutput = runScraper(loginUsername, offset);
  } catch (err) {
    console.error(`Instagram scraper failed: ${err.message}`);
    return [];
  }

  const posts = scraperOutput.posts || [];
  Object.assign(lastRun, {
    pagesTotal: scraperOutput.pages_total ?? pages.length,
    pagesDone: scraperOutput.pages_done ?? 0,
    blocked: !!scraperOutput.blocked,
    nextOffset: scraperOutput.next_offset ?? 0,
  });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const errors = scraperOutput.errors || [];

  if (errors.length > 0) {
    console.log(`Instagram: ${errors.length} scraping errors:`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  console.log(`Instagram: ${posts.length} posts fetched.\n`);

  if (posts.length === 0) return [];

  const newQuizzes = [];

  for (const post of posts) {
    // Dedup check
    if (isDuplicate('instagram', post.post_id)) {
      continue;
    }

    // The scraper only reports the image URL; fetch it here so posts we have
    // already handled cost nothing, and drop it again if no quiz comes of it.
    if (!post.image_file && post.image_url) post.image_file = await downloadPoster(post.image_url);
    let imagePath = null;
    if (post.image_file) {
      const candidate = path.join(POSTERS_DIR, post.image_file);
      if (existsSync(candidate)) imagePath = candidate;
    }
    const dropPoster = () => { if (imagePath) rmSync(imagePath, { force: true }); };

    // Only process if we have caption or image
    if (!post.caption && !imagePath) {
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    console.log(`  Extracting: @${post.username} — "${(post.caption || '').slice(0, 80)}..."${imagePath ? ' [+image]' : ''}`);

    const sourceContext = { name: post.username, city: post.city, platform: 'instagram', postedAt: post.timestamp };

    let extracted;
    try {
      extracted = await extractQuizFromMessage(post.caption || null, imagePath, sourceContext);
    } catch (err) {
      console.error(`  Extraction failed (will retry next run): ${err.message}`);
      dropPoster();
      continue;
    }

    if (!extracted || !extracted.name) {
      dropPoster();
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    if (extracted.date && extracted.date < today) {
      console.log(`  Skip: already over (${extracted.date})`);
      dropPoster();
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    // Resolve city: GPT extraction > name detection > source page city
    const quizCity = resolveCity(extracted.city, post.city, extracted.name, extracted.mode, extracted.venue);

    // Fuzzy dedup against existing quizzes
    const similar = findSimilarQuiz(extracted);
    if (similar) {
      console.log(`  Skip duplicate: "${extracted.name}" ~ "${similar.name}"`);
      dropPoster();
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    const quiz = {
      id: randomUUID(),
      status: extracted.confidence >= threshold ? 'published' : 'flagged',
      confidence: extracted.confidence,
      name: extracted.name,
      description: extracted.description || '',
      date: extracted.date,
      time: extracted.time,
      venue: extracted.venue,
      venueMapLink: extracted.venueMapLink,
      eligibility: extracted.eligibility || [],
      eligibilityCategories: extracted.eligibilityCategories || [],
      hostingOrg: extracted.hostingOrg,
      quizMasters: extracted.quizMasters || [],
      poc: extracted.poc || { name: null, phone: null, whatsapp: null },
      regLink: extracted.regLink,
      instagramLink: extracted.instagramLink || `https://instagram.com/p/${post.post_id}`,
      entryFee: extracted.entryFee ?? null,
      teamSize: extracted.teamSize ?? null,
      crossCollege: extracted.crossCollege ?? null,
      mode: extracted.mode || 'offline',
      city: quizCity,
      source: 'instagram',
      sourceId: `instagram:${post.post_id}`,
      sourceUsername: post.username,
      posterImage: imagePath ? `posters/${post.image_file}` : null,
      sourceCaption: post.caption || null,
      sourceTimestamp: post.timestamp ? post.timestamp.replace(/(?<!Z|[+-]\d\d:?\d\d)$/, 'Z') : new Date().toISOString(), // scraper gives UTC without a zone
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extractedFields: extracted.extractedFields || [],
    };

    addQuiz(quiz);
    markSourceItemProcessed('instagram', post.post_id);
    newQuizzes.push(quiz);
    console.log(`  + "${quiz.name}" [${quiz.status}]`);

    // Update last-fetch timestamp for this page
    setInstagramLastFetch(post.username, post.timestamp);
  }

  console.log(`\nInstagram: ${newQuizzes.length} new quizzes.\n`);
  return newQuizzes;
}
