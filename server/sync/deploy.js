#!/usr/bin/env node
/**
 * Daily sync + deploy script.
 *
 * Usage: npm run deploy
 *
 * 1. Connects to WhatsApp and fetches recent messages from all configured groups
 * 2. Extracts quiz details via GPT-4o
 * 3. Builds the client (copies quizzes.json + posters into dist)
 * 4. Commits and pushes to GitHub (triggers Vercel redeploy)
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncWhatsApp } from './whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function runQuiet(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

async function main() {
  console.log('=== Quiz Finder: Daily Sync & Deploy ===\n');

  // Step 1: Sync WhatsApp
  console.log('--- Step 1: WhatsApp Sync ---');
  let newQuizzes = [];
  try {
    newQuizzes = await syncWhatsApp();
    console.log(`\nSync done: ${newQuizzes.length} new quizzes extracted.\n`);
  } catch (err) {
    console.error(`Sync failed: ${err.message}`);
    if (err.message.includes('logged out') || err.message.includes('QR')) {
      console.error('\nYou need to re-link WhatsApp:');
      console.error('  1. Delete auth_info_baileys/ folder');
      console.error('  2. Run: npm run sync');
      console.error('  3. Scan the QR code with your phone');
      console.error('  4. Run: npm run deploy (again)');
      process.exit(1);
    }
    // Continue with deploy even if sync fails — still push any local changes
    console.log('Continuing with deploy despite sync failure...\n');
  }

  // Step 2: Check for changes
  console.log('--- Step 2: Check for changes ---');
  const status = runQuiet('git status --porcelain data/quizzes.json data/posters/');
  if (!status) {
    console.log('No changes to quizzes or posters. Nothing to deploy.');
    process.exit(0);
  }
  console.log('Changes detected:\n' + status + '\n');

  // Step 3: Commit and push
  console.log('--- Step 3: Commit & Push ---');
  run('git add data/quizzes.json data/posters/');

  const today = new Date().toISOString().split('T')[0];
  const quizCount = newQuizzes.length;
  const msg = quizCount > 0
    ? `data: sync ${today} — ${quizCount} new quiz${quizCount > 1 ? 'zes' : ''}`
    : `data: sync ${today}`;

  run(`git commit -m "${msg}"`);
  run('git push origin master');

  console.log('\n=== Deploy complete! Vercel will auto-redeploy. ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
