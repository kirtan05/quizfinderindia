#!/usr/bin/env node
/**
 * npm run sync — the only command you need.
 *
 * 1. Connects WhatsApp (auto re-links if session expired)
 * 2. Fetches messages from configured groups
 * 3. Scrapes Instagram pages for recent posts
 * 4. Extracts quiz details via GPT-4o
 * 5. Sends push notifications for new quizzes
 * 6. Commits quizzes.json + new posters
 * 7. Pushes to GitHub → Vercel auto-deploys
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncWhatsApp } from './whatsapp.js';
import { syncInstagram } from './instagram.js';
import { sendNotifications } from './notify.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function runQuiet(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

async function main() {
  console.log('=== Quiz Finder: Sync ===\n');

  // 1. WhatsApp sync
  let waQuizzes = [];
  try {
    waQuizzes = await syncWhatsApp();
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED' || err.message === 'LOGGED_OUT') {
      console.log('\nSession expired. Re-linking...\n');
      await new Promise(r => setTimeout(r, 5_000));
      waQuizzes = await syncWhatsApp({ freshAuth: true });
    } else {
      console.error(`WhatsApp sync failed: ${err.message}`);
      console.log('Continuing with other sources...\n');
    }
  }

  // 2. Instagram sync
  let igQuizzes = [];
  try {
    igQuizzes = await syncInstagram();
  } catch (err) {
    console.error(`Instagram sync failed: ${err.message}`);
    console.log('Continuing without Instagram results.\n');
  }

  // 3. Summary
  const allNewQuizzes = [...waQuizzes, ...igQuizzes];
  console.log(`\n${allNewQuizzes.length} new quizzes (${waQuizzes.length} WhatsApp, ${igQuizzes.length} Instagram).\n`);

  // 4. Push notifications
  if (allNewQuizzes.length > 0) {
    try {
      await sendNotifications(allNewQuizzes);
    } catch (err) {
      console.error(`Push notifications failed: ${err.message}`);
    }
  }

  // 5. Git commit + push
  const status = runQuiet('git status --porcelain data/quizzes.json data/posters/');
  if (!status) {
    console.log('No changes to push.');
    return;
  }
  console.log('Changes:\n' + status + '\n');

  run('git add data/quizzes.json data/posters/');
  const today = new Date().toISOString().split('T')[0];
  const n = allNewQuizzes.length;
  const sources = [...new Set(allNewQuizzes.map(q => q.source || 'whatsapp'))].join('+');
  const msg = n > 0
    ? `data: sync ${today} — ${n} new quiz${n > 1 ? 'zes' : ''} (${sources})`
    : `data: sync ${today}`;
  run(`git commit -m "${msg}"`);

  const branch = runQuiet('git rev-parse --abbrev-ref HEAD');
  run(`git push origin ${branch}`);

  console.log('\nDone! Vercel will auto-redeploy.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); });
