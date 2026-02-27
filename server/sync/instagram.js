import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { extractQuizFromMessage } from './extractor.js';
import { isDuplicate, findSimilarQuiz } from './dedup.js';
import { addQuiz, markSourceItemProcessed, setInstagramLastFetch } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER_PATH = path.join(__dirname, 'instagram', 'scraper.py');
const PAGES_PATH = path.join(__dirname, 'instagram', 'pages.json');
const POSTERS_DIR = path.join(__dirname, '..', '..', 'data', 'posters');

/**
 * Check if python3 and instaloader are available.
 * Returns true if both are installed.
 */
function checkDependencies() {
  try {
    const result = spawnSync('python3', ['-c', 'import instaloader'], { stdio: 'pipe' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Run the Python scraper and return parsed JSON output.
 */
function runScraper(loginUsername) {
  const args = [SCRAPER_PATH, '--pages', PAGES_PATH];

  if (loginUsername) {
    args.push('--login', loginUsername);
  }

  console.log(`Running Instagram scraper...`);

  const result = spawnSync('python3', args, {
    encoding: 'utf-8',
    timeout: 600_000, // 10 minutes
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
export async function syncInstagram() {
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
    console.log('  Install with: pip install instaloader');
    return [];
  }

  const loginUsername = process.env.INSTAGRAM_USERNAME || null;
  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;

  // Run Python scraper
  let scraperOutput;
  try {
    scraperOutput = runScraper(loginUsername);
  } catch (err) {
    console.error(`Instagram scraper failed: ${err.message}`);
    return [];
  }

  const posts = scraperOutput.posts || [];
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

    const imagePath = post.image_file
      ? path.join(POSTERS_DIR, post.image_file)
      : null;

    // Only process if we have caption or image
    if (!post.caption && !imagePath) {
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    console.log(`  Extracting: @${post.username} — "${(post.caption || '').slice(0, 80)}..."${imagePath ? ' [+image]' : ''}`);

    let extracted;
    try {
      extracted = await extractQuizFromMessage(post.caption || null, imagePath);
    } catch (err) {
      console.error(`  GPT extraction failed: ${err.message}`);
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    if (!extracted || !extracted.name) {
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    // Determine city: extracted > post metadata > null
    let quizCity = post.city || null;
    if (extracted.city) quizCity = extracted.city;
    else if (extracted.mode === 'online') quizCity = 'Online';

    // Fuzzy dedup against existing quizzes
    const similar = findSimilarQuiz(extracted, quizCity);
    if (similar) {
      console.log(`  Skip duplicate: "${extracted.name}" ~ "${similar.name}"`);
      markSourceItemProcessed('instagram', post.post_id);
      continue;
    }

    const quiz = {
      id: uuidv4(),
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
      teamSize: extracted.teamSize ?? null,
      crossCollege: extracted.crossCollege ?? null,
      mode: extracted.mode || 'offline',
      city: quizCity,
      source: 'instagram',
      sourceId: `instagram:${post.post_id}`,
      sourceUsername: post.username,
      posterImage: post.image_file ? `posters/${post.image_file}` : null,
      sourceCaption: post.caption || null,
      sourceTimestamp: post.timestamp || new Date().toISOString(),
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
