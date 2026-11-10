// Push subscriptions, one KV entry per browser endpoint, so subscribing again just overwrites.
async function subKey(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|.+\.notify\.windows\.com|.+\.push\.apple\.com)$/;
const short = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const list = v => Array.isArray(v) && v.length <= 50 && v.every(s => short(s, 100));

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: 'Too large' }, { status: 413 });
  const { subscription, preferences } = (() => { try { return JSON.parse(raw) || {}; } catch { return {}; } })();
  const { endpoint, keys } = subscription || {};
  const { cities, eligibility = [] } = preferences || {};
  let host;
  try { const u = new URL(endpoint); host = u.protocol === 'https:' && u.hostname; } catch { /* invalid */ }
  if (!host || !PUSH_HOST.test(host) || !short(endpoint, 1024) || !short(keys?.p256dh, 200) || !short(keys?.auth, 100)
      || !list(cities) || !cities.length || !list(eligibility)) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  await env.PUSH_SUBS.put(await subKey(endpoint), JSON.stringify({
    subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    preferences: { cities, eligibility },
  }));
  return Response.json({ success: true });
}

export async function onRequestDelete({ request, env }) {
  const { endpoint } = await request.json().catch(() => ({}));
  if (!endpoint) return Response.json({ error: 'Missing endpoint' }, { status: 400 });
  await env.PUSH_SUBS.delete(await subKey(endpoint));
  return Response.json({ success: true });
}
