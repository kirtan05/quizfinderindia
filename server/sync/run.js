#!/usr/bin/env node
/**
 * npm run sync — the only command you need.
 *
 * 1. Connects WhatsApp (auto re-links if session expired)
 * 2. Fetches messages from configured groups
 * 3. Extracts quiz details via GPT-4o
 * 4. Commits quizzes.json + new posters
 * 5. Pushes to GitHub → Vercel auto-deploys
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncWhatsApp } from './whatsapp.js';

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

  // Sync WhatsApp
  let newQuizzes = [];
  try {
    newQuizzes = await syncWhatsApp();
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED' || err.message === 'LOGGED_OUT') {
      console.log('\nSession expired. Re-linking...\n');
      await new Promise(r => setTimeout(r, 5_000));
      newQuizzes = await syncWhatsApp({ freshAuth: true });
    } else {
      console.error(`Sync failed: ${err.message}`);
      console.log('Pushing any local changes...\n');
    }
  }
  console.log(`\n${newQuizzes.length} new quizzes.\n`);

  // Check for changes
  const status = runQuiet('git status --porcelain data/quizzes.json data/posters/');
  if (!status) {
    console.log('No changes to push.');
    return;
  }
  console.log('Changes:\n' + status + '\n');

  // Commit + push
  run('git add data/quizzes.json data/posters/');
  const today = new Date().toISOString().split('T')[0];
  const n = newQuizzes.length;
  const msg = n > 0 ? `data: sync ${today} — ${n} new quiz${n > 1 ? 'zes' : ''}` : `data: sync ${today}`;
  run(`git commit -m "${msg}"`);
  run('git push origin master');

  console.log('\nDone! Vercel will auto-redeploy.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Fatal:', err.message); process.exit(1); });
