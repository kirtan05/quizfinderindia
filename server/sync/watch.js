#!/usr/bin/env node
/**
 * npm run watch — unattended WhatsApp → site updater.
 *
 * Reads new messages for the groups in data/city-groups.json straight from the
 * `wa` CLI's message store (~/.local/share/wa/store/wa.db, kept current by the
 * always-on `wa` service), extracts quizzes, then commits and pushes
 * quizzes.json + posters so Vercel redeploys. Holds no WhatsApp session itself.
 *
 * Run by systemd (deploy/quizfinder-watch.timer). Flags:
 *   --dry-run     extract and print, write nothing
 *   --no-push     write data files but skip git commit/push
 *   --days N      look back N days on this run (default: since last run, max 14)
 *   --ig          scrape Instagram on this run even if it is not due yet
 *   --no-ig       skip Instagram on this run
 *
 * Instagram pages (server/sync/instagram/pages.json) are scraped at most once
 * every IG_EVERY_HOURS, since Instagram rate-limits anonymous access.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { extractQuizFromMessage } from './extractor.js';
import { isDuplicate, findSimilarQuiz } from './dedup.js';
import {
  addQuiz, getQuizzes, markMessageProcessed, getCityGroups, getSyncState, saveSyncState,
} from '../store.js';
import { resolveCity } from '../utils/cities.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const POSTERS_DIR = path.join(ROOT, 'data', 'posters');
const WA_HOME = process.env.WA_HOME || path.join(os.homedir(), '.local', 'share', 'wa');
const WA_DB = path.join(WA_HOME, 'store', 'wa.db');
const WA_CLI_DIR = process.env.WA_CLI_DIR || path.join(os.homedir(), 'Desktop', 'projects', 'wa-cli');
const MAX_LOOKBACK_DAYS = 14;
const MERGE_WINDOW = 120; // seconds between a poster and its text from the same sender
const ALERT_EVERY_MS = 6 * 3600_000;
const IG_EVERY_MS = (Number(process.env.IG_EVERY_HOURS) || 6) * 3600_000;
const QUIZ_HINT = /quiz|regist|prelim|finals|venue|prize|forms\.gle|📅|🗓/i;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const NO_PUSH = DRY || args.includes('--no-push');
const daysArg = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : null;

const log = (...a) => console.log(...a);

// Baileys is only needed to decode stored messages and decrypt media, so borrow the
// copy the wa CLI already has installed instead of installing a second one here.
async function loadBaileys() {
  for (const name of ['@whiskeysockets/baileys', 'baileys']) {
    const entry = path.join(WA_CLI_DIR, 'node_modules', name, 'lib', 'index.js');
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  throw new Error(`Baileys not found under ${WA_CLI_DIR}/node_modules (set WA_CLI_DIR)`);
}

function groupConfig() {
  const groups = new Map(); // jid -> { name, city, discussion }
  for (const [city, { groups: list }] of Object.entries(getCityGroups().cities)) {
    for (const g of list) {
      if (typeof g === 'string') groups.set(g, { name: g, city, discussion: false });
      else if (g.id) groups.set(g.id, { name: g.name || g.id, city, discussion: !!g.discussion });
    }
  }
  return groups;
}

function textOf(content, type) {
  if (type === 'conversation') return content.conversation;
  if (type === 'extendedTextMessage') return content.extendedTextMessage?.text;
  if (type === 'imageMessage') return content.imageMessage?.caption;
  return null;
}

/** Turn stored rows into candidate items, pairing a caption-less poster with adjacent text. */
function buildItems(rows, B) {
  const msgs = [];
  for (const row of rows) {
    let m;
    try { m = JSON.parse(row.raw, B.BufferJSON.reviver); } catch { continue; }
    const content = B.normalizeMessageContent(m.message);
    if (!content) continue;
    const type = B.getContentType(content);
    if (!['conversation', 'extendedTextMessage', 'imageMessage'].includes(type)) continue;
    msgs.push({
      chat: row.chat, id: row.id, ts: row.ts, sender: row.sender || m.key?.participant || '',
      type, text: textOf(content, type) || '', hasImage: type === 'imageMessage',
      media: type === 'imageMessage' ? { ...m, message: content } : null,
    });
  }

  const items = [];
  for (let i = 0; i < msgs.length; i++) {
    const cur = msgs[i];
    const nxt = msgs[i + 1];
    const pairable = nxt && nxt.chat === cur.chat && nxt.sender === cur.sender
      && Math.abs(nxt.ts - cur.ts) <= MERGE_WINDOW
      && ((cur.hasImage && !cur.text && !nxt.hasImage) || (!cur.hasImage && nxt.hasImage && !nxt.text));
    if (pairable) {
      const img = cur.hasImage ? cur : nxt;
      const txt = cur.hasImage ? nxt : cur;
      items.push({ ...img, text: txt.text, ids: [cur.id, nxt.id] });
      i++;
    } else {
      items.push({ ...cur, ids: [cur.id] });
    }
  }
  return items;
}

/** Cheap gate so chatter never costs an extraction call. */
function worthExtracting(item, group) {
  if (group.discussion) return item.text.length >= 150 && QUIZ_HINT.test(item.text);
  return item.hasImage || item.text.length >= 80;
}

async function downloadPoster(item, B) {
  try {
    const buf = await B.downloadMediaMessage(item.media, 'buffer', {});
    const file = path.join(POSTERS_DIR, `${randomUUID()}.jpg`);
    writeFileSync(file, buf);
    return file;
  } catch (err) {
    log(`  poster unavailable (${err.message}); using text only`);
    return null;
  }
}

async function processItem(item, group, B, threshold) {
  const done = () => { if (!DRY) item.ids.forEach(id => markMessageProcessed(id)); };

  let imagePath = null;
  if (item.hasImage) {
    if (!existsSync(POSTERS_DIR)) mkdirSync(POSTERS_DIR, { recursive: true });
    imagePath = await downloadPoster(item, B);
  }
  if (!imagePath && !item.text) { done(); return null; }
  const dropPoster = () => { if (imagePath) rmSync(imagePath, { force: true }); };

  log(`  Extracting: "${item.text.slice(0, 70).replace(/\s+/g, ' ')}"${imagePath ? ' [+image]' : ''}`);
  const postedAt = new Date(item.ts * 1000).toISOString();
  let extracted;
  try {
    extracted = await extractQuizFromMessage(item.text || null, imagePath, {
      name: group.name, city: group.city, platform: 'whatsapp', postedAt,
    });
  } catch (err) {
    dropPoster();
    throw err; // not marked processed: retried on the next run
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let skip = null;
  if (!extracted || !extracted.name) skip = 'not a quiz announcement';
  else if (extracted.date && extracted.date < today) skip = `already over (${extracted.date})`;
  else {
    const similar = findSimilarQuiz(extracted);
    if (similar) skip = `duplicate of "${similar.name}"`;
  }
  if (skip) {
    log(`    skip: ${skip}`);
    dropPoster();
    done();
    return null;
  }

  const now = new Date().toISOString();
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
    instagramLink: extracted.instagramLink,
    teamSize: extracted.teamSize ?? null,
    crossCollege: extracted.crossCollege ?? null,
    mode: extracted.mode || 'offline',
    city: resolveCity(extracted.city, group.city, extracted.name, extracted.mode, extracted.venue),
    source: 'whatsapp',
    sourceId: `whatsapp:${item.id}`,
    sourceGroupId: item.chat,
    posterImage: imagePath ? `posters/${path.basename(imagePath)}` : null,
    sourceCaption: item.text || null,
    sourceMessageId: item.id,
    sourceTimestamp: postedAt,
    createdAt: now,
    updatedAt: now,
    extractedFields: extracted.extractedFields || [],
  };

  if (DRY) dropPoster(); else addQuiz(quiz);
  done();
  return quiz;
}

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function publish(newQuizzes) {
  if (!git('status', '--porcelain', 'data/quizzes.json', 'data/posters/')) {
    log('No changes to push.');
    return;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'master') {
    throw new Error(`repo is on "${branch}", not master: data updated on disk but not committed`);
  }
  git('add', 'data/quizzes.json', 'data/posters/');
  const today = new Date().toISOString().split('T')[0];
  const n = newQuizzes.length;
  const sources = [...new Set(newQuizzes.map(q => q.source))].sort().reverse().join('+') || 'whatsapp';
  git('commit', '-m', `data: sync ${today} — ${n} new quiz${n === 1 ? '' : 'zes'} (${sources})`,
    '--', 'data/quizzes.json', 'data/posters/');
  try {
    git('push', 'origin', 'master');
  } catch {
    git('pull', '--rebase', '--autostash', 'origin', 'master');
    git('push', 'origin', 'master');
  }
  log('Pushed. Vercel will redeploy.');
}

/** WhatsApp the owner (the linked account itself) when a run fails, at most once per 6 h. */
function alertOwner(message) {
  const state = getSyncState();
  const last = state.watch?.lastAlertAt ? Date.parse(state.watch.lastAlertAt) : 0;
  if (Date.now() - last < ALERT_EVERY_MS) return;
  try {
    const me = execFileSync('wa', ['check'], { encoding: 'utf-8' }).match(/VALID: (\d+)/)?.[1];
    if (!me) return;
    execFileSync('wa', ['send', me, '--text', `QuizFinder watcher: ${message}`], { stdio: 'ignore', timeout: 90_000 });
    state.watch = { ...state.watch, lastAlertAt: new Date().toISOString() };
    saveSyncState(state);
  } catch (err) {
    console.error(`Could not send alert: ${err.message}`);
  }
}

/** One run at a time: a manual run and the timer must not write the data files together. */
function takeLock() {
  const lock = path.join(ROOT, 'data', '.watch.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf-8'));
    try { process.kill(pid, 0); return false; } catch { /* stale lock, owner is gone */ }
  }
  writeFileSync(lock, String(process.pid));
  process.on('exit', () => rmSync(lock, { force: true }));
  return true;
}

async function main() {
  if (!DRY && !takeLock()) { log('Another watcher run is in progress; exiting.'); return; }
  const groups = groupConfig();
  if (groups.size === 0) throw new Error('No groups configured in data/city-groups.json');
  if (!existsSync(WA_DB)) throw new Error(`wa store not found at ${WA_DB}`);

  const B = await loadBaileys();
  const state = getSyncState();
  const nowSec = Math.floor(Date.now() / 1000);
  const floor = nowSec - MAX_LOOKBACK_DAYS * 86400;

  // First run on a fresh checkout: sync-state.json is not in git, so seed the
  // processed list from the quizzes already published.
  if (!state.watch && !DRY) {
    for (const q of getQuizzes()) if (q.sourceMessageId && q.source === 'whatsapp') markMessageProcessed(q.sourceMessageId);
  }
  const since = daysArg ? nowSec - daysArg * 86400 : Math.max(state.watch?.lastTs ?? 0, floor);

  const db = new DatabaseSync(WA_DB, { readOnly: true });
  const marks = [...groups.keys()].map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT chat, id, ts, sender, raw FROM messages
     WHERE chat IN (${marks}) AND ts > ? AND body = 1 ORDER BY chat, ts, id`
  ).all(...groups.keys(), since - MERGE_WINDOW);
  db.close();

  const items = buildItems(rows, B).filter(it => !it.ids.every(id => isDuplicate('whatsapp', id)));
  log(`=== Quiz Finder watch: ${rows.length} messages since ${new Date(since * 1000).toISOString()}, ${items.length} unprocessed ===`);

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;
  const added = [];
  let attempted = 0;
  let failed = 0;
  let earliestFailure = Infinity;
  let maxTs = since;

  for (const item of items) {
    const group = groups.get(item.chat);
    maxTs = Math.max(maxTs, item.ts);
    if (!worthExtracting(item, group)) {
      if (!DRY) item.ids.forEach(id => markMessageProcessed(id));
      continue;
    }
    attempted++;
    log(`[${group.name}]`);
    try {
      const quiz = await processItem(item, group, B, threshold);
      if (quiz) {
        added.push(quiz);
        log(`    + "${quiz.name}" ${quiz.date || 'no date'} ${quiz.city || ''} [${quiz.status}]`);
      }
    } catch (err) {
      failed++;
      earliestFailure = Math.min(earliestFailure, item.ts);
      console.error(`    error: ${err.message}`);
      if (failed >= 5 && failed === attempted) break; // extractor is down, stop burning time
    }
  }

  log(`\n${added.length} new quizzes, ${attempted} extraction calls, ${failed} failed.`);

  const igProblem = await instagramPass(added);

  if (!DRY) {
    const fresh = getSyncState();
    // Stop the cursor just before the first failure so that message is retried.
    fresh.watch = { ...fresh.watch, lastTs: Math.min(maxTs, earliestFailure - 1), lastRunAt: new Date().toISOString() };
    saveSyncState(fresh);
  }

  if (added.length && !DRY) {
    // Loaded lazily: web-push is an npm dependency the rest of the watcher does not need.
    try {
      const { sendNotifications } = await import('./notify.js');
      await sendNotifications(added.filter(q => q.status === 'published'));
    } catch (err) { console.error(`Push notifications skipped: ${err.message}`); }
  }
  if (!NO_PUSH) publish(added);

  if (failed && failed === attempted) throw new Error(`all ${failed} extraction calls failed`);
  if (igProblem) throw new Error(igProblem);
}

/** Scrape Instagram if it is due. Returns a problem description, or null. */
async function instagramPass(added) {
  if (DRY || args.includes('--no-ig')) return null;
  const state = getSyncState();
  const last = state.watch?.lastIgAt ? Date.parse(state.watch.lastIgAt) : 0;
  if (!args.includes('--ig') && Date.now() - last < IG_EVERY_MS) return null;

  log('\n=== Instagram ===');
  let problem = null;
  let nextOffset = state.watch?.igOffset || 0;
  try {
    const ig = await import('./instagram.js');
    const quizzes = await ig.syncInstagram({ offset: nextOffset });
    added.push(...quizzes);
    const { pagesDone, pagesTotal, blocked } = ig.lastRun;
    log(`Instagram: ${pagesDone}/${pagesTotal} pages read${blocked ? ', then blocked' : ''}.`);
    nextOffset = blocked ? ig.lastRun.nextOffset : 0;
    if (pagesTotal && pagesDone === 0) problem = 'Instagram refused every page (rate limited or login required)';
  } catch (err) {
    console.error(`Instagram pass failed: ${err.message}`);
    problem = `Instagram pass failed: ${err.message}`;
  }
  const fresh = getSyncState();
  fresh.watch = { ...fresh.watch, lastIgAt: new Date().toISOString(), igOffset: nextOffset };
  saveSyncState(fresh);
  return problem;
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err.message);
    if (!DRY) alertOwner(err.message.slice(0, 300));
    process.exit(1);
  });
