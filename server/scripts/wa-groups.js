import 'dotenv/config';
import makeWASocket, { useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from 'baileys';
import pino from 'pino';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const AUTH_DIR = path.join(ROOT, 'auth_info_baileys');
const CONFIG_PATH = path.join(ROOT, 'data', 'city-groups.json');

const QUIZ_KEYWORDS = /quiz|announcement|qa|trivia|qfb|qfi|kqa|dqc|qpq|factaco/i;
const MIN_MEMBERS = 200;

// ── Helpers ──────────────────────────────────────

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return { cities: {} };
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

/** Collect every group ID currently tracked across all cities. */
function getTrackedIds(config) {
  const ids = new Set();
  for (const city of Object.values(config.cities)) {
    for (const g of city.groups || []) {
      ids.add(typeof g === 'string' ? g : g.id);
    }
  }
  return ids;
}

// ── LIST ─────────────────────────────────────────

async function list() {
  const config = loadConfig();
  const trackedIds = getTrackedIds(config);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        reject(new Error(`Connection closed (${code})`));
        return;
      }

      if (connection === 'open') {
        try {
          console.log('Connected. Fetching groups...\n');
          const groups = await sock.groupFetchAllParticipating();
          const entries = Object.values(groups);

          const filtered = entries
            .filter((g) => (g.participants?.length || 0) >= MIN_MEMBERS)
            .sort((a, b) => (b.participants?.length || 0) - (a.participants?.length || 0));

          console.log(`Found ${filtered.length} groups with ${MIN_MEMBERS}+ members:\n`);
          console.log('Members | Status                | Name');
          console.log('--------|----------------------|-----');

          for (const g of filtered) {
            const members = String(g.participants?.length || 0).padStart(6);
            const isQuiz = QUIZ_KEYWORDS.test(g.subject);
            const isTracked = trackedIds.has(g.id);

            const badges = [];
            if (isTracked) badges.push('[TRACKED]');
            if (isQuiz) badges.push('[QUIZ?]');
            const status = badges.join(' ').padEnd(20);

            console.log(`${members}  | ${status} | ${g.subject}`);
            console.log(`        |                      |   ${g.id}`);
          }

          console.log(`\nTotal: ${filtered.length} groups`);
          sock.end(undefined);
          resolve();
        } catch (err) {
          sock.end(undefined);
          reject(err);
        }
      }
    });
  });
}

// ── ADD ──────────────────────────────────────────

function add(args) {
  if (args.length < 3) {
    console.error('Usage: wa add <city> "<name>" <id>');
    process.exit(1);
  }

  const city = args[0];
  const name = args[1];
  const id = args[2];

  const config = loadConfig();

  if (!config.cities[city]) {
    config.cities[city] = { groups: [] };
    console.log(`Created new city: ${city}`);
  }

  const existing = config.cities[city].groups.find((g) => {
    const gid = typeof g === 'string' ? g : g.id;
    return gid === id;
  });

  if (existing) {
    console.error(`Group ${id} already exists in ${city}`);
    process.exit(1);
  }

  config.cities[city].groups.push({ name, id });
  saveConfig(config);
  console.log(`Added "${name}" (${id}) to ${city}`);
}

// ── REMOVE ───────────────────────────────────────

function remove(args) {
  if (args.length < 1) {
    console.error('Usage: wa remove <id>');
    process.exit(1);
  }

  const id = args[0];
  const config = loadConfig();
  let found = false;

  for (const [cityName, city] of Object.entries(config.cities)) {
    const idx = city.groups.findIndex((g) => {
      const gid = typeof g === 'string' ? g : g.id;
      return gid === id;
    });

    if (idx !== -1) {
      const removed = city.groups.splice(idx, 1)[0];
      const label = typeof removed === 'string' ? removed : removed.name;
      console.log(`Removed "${label}" (${id}) from ${cityName}`);
      found = true;
      break;
    }
  }

  if (!found) {
    console.error(`Group ${id} not found in any city`);
    process.exit(1);
  }

  saveConfig(config);
}

// ── Main ─────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'list':
    list().catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'add':
    add(args);
    break;
  case 'remove':
    remove(args);
    break;
  default:
    console.log(`WhatsApp Group Manager

Usage:
  npm run wa -- list                     List all joined groups (200+ members)
  npm run wa -- add <city> "<name>" <id> Add group to city-groups.json
  npm run wa -- remove <id>              Remove group from city-groups.json`);
    process.exit(command ? 1 : 0);
}
