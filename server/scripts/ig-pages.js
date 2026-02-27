#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_PATH = path.join(__dirname, '..', 'sync', 'instagram', 'pages.json');

function loadPages() {
  if (!existsSync(PAGES_PATH)) return [];
  return JSON.parse(readFileSync(PAGES_PATH, 'utf-8'));
}

function savePages(pages) {
  writeFileSync(PAGES_PATH, JSON.stringify(pages, null, 2) + '\n');
}

// ── LIST ─────────────────────────────────────────

function list() {
  const pages = loadPages();
  if (pages.length === 0) {
    console.log('No Instagram pages tracked.');
    return;
  }

  // Group by city
  const byCity = {};
  for (const p of pages) {
    const city = p.city || 'Unknown';
    if (!byCity[city]) byCity[city] = [];
    byCity[city].push(p);
  }

  console.log(`Tracked Instagram pages (${pages.length} total):\n`);
  for (const [city, cityPages] of Object.entries(byCity).sort()) {
    console.log(`  ${city} (${cityPages.length}):`);
    for (const p of cityPages) {
      console.log(`    @${p.username}  ${p.name}`);
    }
    console.log();
  }
}

// ── ADD ──────────────────────────────────────────

function add(args) {
  if (args.length < 3) {
    console.error('Usage: ig add <username> <city> "<name>"');
    process.exit(1);
  }

  const username = args[0].replace(/^@/, '');
  const city = args[1];
  const name = args.slice(2).join(' ');

  const pages = loadPages();

  const existing = pages.find(p => p.username === username);
  if (existing) {
    console.error(`@${username} already tracked (${existing.city}: ${existing.name})`);
    process.exit(1);
  }

  pages.push({ username, city, name });
  savePages(pages);
  console.log(`Added @${username} (${city}: ${name})`);
}

// ── REMOVE ───────────────────────────────────────

function remove(args) {
  if (args.length < 1) {
    console.error('Usage: ig remove <username>');
    process.exit(1);
  }

  const username = args[0].replace(/^@/, '');
  const pages = loadPages();

  const idx = pages.findIndex(p => p.username === username);
  if (idx === -1) {
    console.error(`@${username} not found in tracked pages`);
    process.exit(1);
  }

  const removed = pages.splice(idx, 1)[0];
  savePages(pages);
  console.log(`Removed @${removed.username} (${removed.city}: ${removed.name})`);
}

// ── Main ─────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'list':
    list();
    break;
  case 'add':
    add(args);
    break;
  case 'remove':
    remove(args);
    break;
  default:
    console.log(`Instagram Page Manager

Usage:
  npm run ig -- list                          List all tracked pages by city
  npm run ig -- add <username> <city> "<name>" Add a page to track
  npm run ig -- remove <username>              Remove a page`);
    process.exit(command ? 1 : 0);
}
