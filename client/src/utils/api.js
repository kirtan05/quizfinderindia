const BASE = '';

export async function fetchQuizzes(params = {}) {
  const query = new URLSearchParams();
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
  if (!res.ok) throw new Error('Sync trigger failed');
  return res.json();
}
