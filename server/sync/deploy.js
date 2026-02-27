#!/usr/bin/env node
/**
 * Daily sync + deploy.
 * Usage: npm run deploy
 *
 * 1. Syncs WhatsApp (auto re-links if session expired)
 * 2. Commits updated quizzes + posters
 * 3. Pushes to GitHub → Vercel auto-deploys
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
  console.log('=== Quiz Finder: Sync & Deploy ===\n');

  // Step 1: Sync
  let newQuizzes = [];
  try {
    newQuizzes = await syncWhatsApp();
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED' || err.message === 'LOGGED_OUT') {
      console.log('\nSession expired. Re-linking...\n');
      newQuizzes = await syncWhatsApp({ freshAuth: true });
    } else {
      console.error(`Sync failed: ${err.message}`);
      console.log('Continuing to deploy any local changes...\n');
    }
  }
  console.log(`\n${newQuizzes.length} new quizzes.\n`);

  // Step 2: Check for changes
  const status = runQuiet('git status --porcelain data/quizzes.json data/posters/');
  if (!status) {
    console.log('No changes. Nothing to deploy.');
    return;
  }
  console.log('Changes:\n' + status + '\n');

  // Step 3: Commit + push
  run('git add data/quizzes.json data/posters/');
  const today = new Date().toISOString().split('T')[0];
  const n = newQuizzes.length;
  const msg = n > 0 ? `data: sync ${today} — ${n} new quiz${n > 1 ? 'zes' : ''}` : `data: sync ${today}`;
  run(`git commit -m "${msg}"`);
  run('git push origin master');

  console.log('\nDeployed! Vercel will auto-redeploy.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
