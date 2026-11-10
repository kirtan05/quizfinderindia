// Called by the sync watcher with the newly published quizzes; pushes them to matching subscribers.
import { buildPushPayload } from '@block65/webcrypto-web-push';

// Free plan: ~10 ms CPU per invocation and each encrypted push costs ~1 ms, so handle a small batch
// per call; the response carries the KV cursor to resume from.
const BATCH = 8;

const matches = ({ cities = [], eligibility = [] }, q) =>
  (!cities.length || cities.includes(q.city) || q.city === 'Online' || q.mode === 'online') &&
  (!eligibility.length || eligibility.some(e => (q.eligibilityCategories || []).includes(e)));

export async function onRequestPost({ request, env }) {
  const auth = new TextEncoder().encode(request.headers.get('Authorization') || '');
  const want = new TextEncoder().encode(`Bearer ${env.NOTIFY_SECRET}`);
  if (!env.NOTIFY_SECRET || auth.byteLength !== want.byteLength || !crypto.subtle.timingSafeEqual(auth, want)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { quizzes, cursor } = await request.json().catch(() => ({}));
  if (!Array.isArray(quizzes)) return Response.json({ error: 'Bad request' }, { status: 400 });
  const vapid = { subject: new URL(request.url).origin, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const result = { sent: 0, failed: 0, removed: 0 };

  const page = await env.PUSH_SUBS.list({ prefix: 'sub:', limit: BATCH, cursor });
  for (const { name } of page.keys) {
    try {
      const { subscription, preferences } = (await env.PUSH_SUBS.get(name, 'json')) || {};
      const matching = quizzes.filter(q => matches(preferences || {}, q));
      if (!subscription || !matching.length) continue;

      const quiz = matching[0];
      const data = {
        title: `Quiz Finder: ${matching.length} new quiz${matching.length > 1 ? 'zes' : ''}`,
        body: matching.length === 1
          ? `${quiz.name}${quiz.city ? ` (${quiz.city})` : ''}${quiz.date ? ` — ${quiz.date}` : ''}`
          : matching.map(q => q.name).slice(0, 3).join(', ') + (matching.length > 3 ? '...' : ''),
        url: matching.length === 1 ? `/quiz/${quiz.id}/` : '/',
        tag: `sync-${new Date().toISOString().split('T')[0]}`,
      };
      const res = await fetch(subscription.endpoint, await buildPushPayload({ data, options: { ttl: 86400 } }, subscription, vapid));
      if (res.ok) { result.sent++; continue; }
      result.failed++;
      if (res.status === 404 || res.status === 410) {
        await env.PUSH_SUBS.delete(name);
        result.removed++;
      }
    } catch {
      result.failed++; // malformed record or failed push: skip it
    }
  }

  return Response.json({ ...result, cursor: page.list_complete ? null : page.cursor });
}
