import { store } from './browser';
const IS_STATIC = import.meta.env.PROD;

export const SITE_ORIGIN = 'https://quizfinder.pages.dev';

const UNDATED_FRESH_DAYS = 14;

// A quiz with no date can't be compared to today, so it counts as upcoming
// only while its announcement is recent; after that it is treated as past.
export function isUpcoming(q) {
  if (q.date) return q.date >= new Date().toLocaleDateString('en-CA');
  const cutoff = new Date(Date.now() - UNDATED_FRESH_DAYS * 86400_000).toISOString();
  return (q.sourceTimestamp || q.createdAt || '') >= cutoff;
}

// --- Public API ---

export async function fetchQuizzes() {
  const res = await fetch(IS_STATIC ? '/data/quizzes.json' : '/api/quizzes');
  if (!res.ok) throw new Error('Failed to fetch quizzes');
  return (await res.json()).filter(q => q.status === 'published');
}

// Past quizzes have their own file on the built site and are fetched only when asked for.
// The dev API already returns them with the rest, and has no such file.
export async function fetchPast() {
  try {
    const res = await fetch('/data/past.json');
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

// WhatsApp group jid -> group name; only the built site has this file (the dev API has no equivalent)
export async function fetchGroupNames() {
  if (!IS_STATIC) return {};
  const res = await fetch('/data/city-groups.json');
  const { cities } = await res.json();
  return Object.fromEntries(
    Object.values(cities).flatMap(c => c.groups.map(g => [g.id, g.name]))
  );
}

// --- Admin API (only works with backend) ---

function authHeaders() {
  const token = store.get('dqc_admin_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function fetchAllQuizzes() {
  const res = await fetch('/api/quizzes/admin/all', { headers: authHeaders() });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function createQuiz(data) {
  const res = await fetch('/api/quizzes', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Create failed');
  return res.json();
}

export async function updateQuiz(id, data) {
  const res = await fetch(`/api/quizzes/${id}`, {
    method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export async function publishQuiz(id) {
  const res = await fetch(`/api/quizzes/${id}/publish`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Publish failed');
  return res.json();
}

export async function deleteQuiz(id) {
  const res = await fetch(`/api/quizzes/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function triggerSync() {
  const res = await fetch('/api/sync/trigger', {
    method: 'POST', headers: authHeaders(),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Sync trigger failed');
  }
  return res.json();
}

export async function fetchSyncStatus() {
  const res = await fetch('/api/sync/status', { headers: authHeaders() });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Failed to fetch sync status');
  return res.json();
}

export async function reconnectWhatsApp() {
  const res = await fetch('/api/sync/reconnect', {
    method: 'POST', headers: authHeaders(),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Reconnect failed');
  return res.json();
}

export async function fetchCachedGroups() {
  const res = await fetch('/api/sync/groups', { headers: authHeaders() });
  if (res.status === 401) throw new AuthError();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export function connectWhatsAppSSE(onQr, onStatus, onGroups, onError) {
  const token = store.get('dqc_admin_token');
  const evtSource = new EventSource(`/api/sync/connect?token=${token}`);

  evtSource.addEventListener('qr', (e) => {
    onQr(JSON.parse(e.data));
  });
  evtSource.addEventListener('status', (e) => {
    onStatus(JSON.parse(e.data));
  });
  evtSource.addEventListener('groups', (e) => {
    onGroups(JSON.parse(e.data));
  });
  evtSource.addEventListener('error', (e) => {
    try { onError(JSON.parse(e.data)); } catch { onError({ message: 'Connection error' }); }
  });
  evtSource.onerror = () => {
    evtSource.close();
  };

  return evtSource;
}

export async function setWhatsAppGroup(groupId) {
  const res = await fetch('/api/sync/set-group', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ groupId }),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Failed to set group');
  return res.json();
}

export class AuthError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}
