const BASE = '';

export async function fetchCities() {
  const res = await fetch(`${BASE}/api/quizzes/cities`);
  if (!res.ok) throw new Error('Failed to fetch cities');
  return res.json();
}

export async function fetchQuizzes(params = {}) {
  const query = new URLSearchParams();
  if (params.city) query.set('city', params.city);
  if (params.eligibility) query.set('eligibility', params.eligibility);
  if (params.org) query.set('org', params.org);
  if (params.upcoming !== undefined) query.set('upcoming', params.upcoming);
  if (params.search) query.set('search', params.search);

  const res = await fetch(`${BASE}/api/quizzes?${query}`);
  if (!res.ok) throw new Error('Failed to fetch quizzes');
  return res.json();
}

export async function fetchQuiz(id) {
  const res = await fetch(`${BASE}/api/quizzes/${id}`);
  if (!res.ok) throw new Error('Quiz not found');
  return res.json();
}

function authHeaders() {
  const token = localStorage.getItem('dqc_admin_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function fetchAllQuizzes() {
  const res = await fetch(`${BASE}/api/quizzes/admin/all`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function fetchFlaggedQuizzes() {
  const res = await fetch(`${BASE}/api/quizzes/admin/flagged`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function createQuiz(data) {
  const res = await fetch(`${BASE}/api/quizzes`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Create failed');
  return res.json();
}

export async function updateQuiz(id, data) {
  const res = await fetch(`${BASE}/api/quizzes/${id}`, {
    method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export async function publishQuiz(id) {
  const res = await fetch(`${BASE}/api/quizzes/${id}/publish`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Publish failed');
  return res.json();
}

export async function deleteQuiz(id) {
  const res = await fetch(`${BASE}/api/quizzes/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function triggerSync() {
  const res = await fetch(`${BASE}/api/sync/trigger`, {
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
  const res = await fetch(`${BASE}/api/sync/status`, { headers: authHeaders() });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Failed to fetch sync status');
  return res.json();
}

export async function reconnectWhatsApp() {
  const res = await fetch(`${BASE}/api/sync/reconnect`, {
    method: 'POST', headers: authHeaders(),
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error('Reconnect failed');
  return res.json();
}

export async function fetchCachedGroups() {
  const res = await fetch(`${BASE}/api/sync/groups`, { headers: authHeaders() });
  if (res.status === 401) throw new AuthError();
  if (res.status === 404) return null; // no cache yet
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export function connectWhatsAppSSE(onQr, onStatus, onGroups, onError) {
  const token = localStorage.getItem('dqc_admin_token');
  const evtSource = new EventSource(`${BASE}/api/sync/connect?token=${token}`);

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
    // SSE closed — expected after connection complete
    evtSource.close();
  };

  return evtSource;
}

export async function setWhatsAppGroup(groupId) {
  const res = await fetch(`${BASE}/api/sync/set-group`, {
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
