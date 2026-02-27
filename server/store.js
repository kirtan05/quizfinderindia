import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const QUIZZES_PATH = path.join(DATA_DIR, 'quizzes.json');
const SYNC_STATE_PATH = path.join(DATA_DIR, 'sync-state.json');
const WA_STATUS_PATH = path.join(DATA_DIR, 'wa-status.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(path.join(DATA_DIR, 'posters'))) {
    mkdirSync(path.join(DATA_DIR, 'posters'), { recursive: true });
  }
  if (!existsSync(QUIZZES_PATH)) writeFileSync(QUIZZES_PATH, '[]');
  if (!existsSync(SYNC_STATE_PATH)) {
    writeFileSync(SYNC_STATE_PATH, JSON.stringify({
      lastSyncTimestamp: null,
      processedSourceIds: [],
      instagram: { lastFetchPerPage: {} }
    }));
  }
}

export function getQuizzes() {
  ensureDataDir();
  return JSON.parse(readFileSync(QUIZZES_PATH, 'utf-8'));
}

export function saveQuizzes(quizzes) {
  ensureDataDir();
  writeFileSync(QUIZZES_PATH, JSON.stringify(quizzes, null, 2));
}

export function getQuizById(id) {
  return getQuizzes().find(q => q.id === id) || null;
}

export function addQuiz(quiz) {
  const quizzes = getQuizzes();
  quizzes.push(quiz);
  saveQuizzes(quizzes);
  return quiz;
}

export function updateQuiz(id, updates) {
  const quizzes = getQuizzes();
  const idx = quizzes.findIndex(q => q.id === id);
  if (idx === -1) return null;
  quizzes[idx] = { ...quizzes[idx], ...updates, updatedAt: new Date().toISOString() };
  saveQuizzes(quizzes);
  return quizzes[idx];
}

export function deleteQuiz(id) {
  const quizzes = getQuizzes();
  const idx = quizzes.findIndex(q => q.id === id);
  if (idx === -1) return false;
  quizzes.splice(idx, 1);
  saveQuizzes(quizzes);
  return true;
}

export function getSyncState() {
  ensureDataDir();
  const state = JSON.parse(readFileSync(SYNC_STATE_PATH, 'utf-8'));

  // Auto-migrate old format: processedMessageIds → processedSourceIds
  if (state.processedMessageIds && !state.processedSourceIds) {
    state.processedSourceIds = state.processedMessageIds.map(id => `whatsapp:${id}`);
    delete state.processedMessageIds;
    if (!state.instagram) state.instagram = { lastFetchPerPage: {} };
    saveSyncState(state);
  }

  // Ensure instagram section exists even on partially-migrated files
  if (!state.instagram) {
    state.instagram = { lastFetchPerPage: {} };
  }

  // Ensure processedSourceIds is always a valid array
  if (!Array.isArray(state.processedSourceIds)) {
    state.processedSourceIds = [];
  }

  return state;
}

export function saveSyncState(state) {
  ensureDataDir();
  writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}

// ---- Source-agnostic ID tracking ----

export function isSourceItemProcessed(sourceType, sourceId) {
  const state = getSyncState();
  const key = `${sourceType}:${sourceId}`;
  return state.processedSourceIds.includes(key);
}

export function markSourceItemProcessed(sourceType, sourceId) {
  const state = getSyncState();
  const key = `${sourceType}:${sourceId}`;
  if (!state.processedSourceIds.includes(key)) {
    state.processedSourceIds.push(key);
  }
  state.lastSyncTimestamp = new Date().toISOString();
  saveSyncState(state);
}

// Backward-compat aliases (delegate to source-agnostic functions)
export function isMessageProcessed(messageId) {
  return isSourceItemProcessed('whatsapp', messageId);
}

export function markMessageProcessed(messageId) {
  markSourceItemProcessed('whatsapp', messageId);
}

// ---- Instagram fetch timestamps ----

export function getInstagramLastFetch(username) {
  const state = getSyncState();
  return state.instagram.lastFetchPerPage[username] || null;
}

export function setInstagramLastFetch(username, timestamp) {
  const state = getSyncState();
  state.instagram.lastFetchPerPage[username] = timestamp;
  saveSyncState(state);
}

const WA_GROUPS_PATH = path.join(DATA_DIR, 'wa-groups.json');

export function getWaGroups() {
  ensureDataDir();
  if (!existsSync(WA_GROUPS_PATH)) return null;
  return JSON.parse(readFileSync(WA_GROUPS_PATH, 'utf-8'));
}

export function saveWaGroups(groups) {
  ensureDataDir();
  writeFileSync(WA_GROUPS_PATH, JSON.stringify(groups, null, 2));
}

const DEFAULT_WA_STATUS = {
  connected: false,
  loggedOut: false,
  lastSync: null,
  error: null,
};

export function getWaStatus() {
  ensureDataDir();
  if (!existsSync(WA_STATUS_PATH)) {
    writeFileSync(WA_STATUS_PATH, JSON.stringify(DEFAULT_WA_STATUS, null, 2));
  }
  return JSON.parse(readFileSync(WA_STATUS_PATH, 'utf-8'));
}

export function saveWaStatus(status) {
  ensureDataDir();
  writeFileSync(WA_STATUS_PATH, JSON.stringify(status, null, 2));
}

// ---- City-Groups Config ----

const CITY_GROUPS_PATH = path.join(DATA_DIR, 'city-groups.json');

export function getCityGroups() {
  ensureDataDir();
  if (!existsSync(CITY_GROUPS_PATH)) {
    writeFileSync(CITY_GROUPS_PATH, JSON.stringify({ cities: {} }, null, 2));
  }
  return JSON.parse(readFileSync(CITY_GROUPS_PATH, 'utf-8'));
}

export function getCityList() {
  const config = getCityGroups();
  return Object.keys(config.cities);
}

export function getGroupCityMap() {
  const config = getCityGroups();
  const map = {};
  for (const [city, { groups }] of Object.entries(config.cities)) {
    for (const g of groups) {
      // Support both { name, id } objects and plain string IDs
      const gid = typeof g === 'string' ? g : g.id;
      if (gid) map[gid] = city;
    }
  }
  return map;
}
