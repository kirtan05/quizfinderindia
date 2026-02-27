// api/subscribe.js
// Vercel serverless function for managing push notification subscriptions.
// Storage: Vercel KV (Redis). Requires KV_REST_API_URL and KV_REST_API_TOKEN env vars.

export default async function handler(req, res) {
  // CORS headers — allow browser POST/DELETE from any origin, but GET is server-to-server (auth-protected)
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Dynamic import @vercel/kv (may not be installed locally)
  let kv;
  try {
    const mod = await import('@vercel/kv');
    kv = mod.kv;
  } catch {
    return res.status(503).json({
      error: 'Vercel KV not configured. Set up KV in the Vercel dashboard and ensure KV_REST_API_URL and KV_REST_API_TOKEN env vars are set.',
    });
  }

  // POST: Save a push subscription + user preferences
  if (req.method === 'POST') {
    const { subscription, preferences } = req.body || {};

    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Missing subscription.endpoint' });
    }

    const key = `pushsub:${Buffer.from(subscription.endpoint).toString('base64url').slice(0, 40)}`;
    const now = new Date().toISOString();

    await kv.set(key, {
      subscription,
      preferences: preferences || {},
      createdAt: now,
      updatedAt: now,
    });

    return res.json({ success: true });
  }

  // GET: Return all subscriptions (auth-protected for the sync script)
  if (req.method === 'GET') {
    const auth = req.headers.authorization;

    if (!process.env.SYNC_API_KEY || auth !== `Bearer ${process.env.SYNC_API_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const keys = [];
    let cursor = 0;
    do {
      const [next, batch] = await kv.scan(cursor, { match: 'pushsub:*', count: 100 });
      cursor = next;
      keys.push(...batch);
    } while (cursor !== 0);

    const subs = await Promise.all(keys.map((k) => kv.get(k)));
    return res.json(subs.filter(Boolean));
  }

  // DELETE: Remove a subscription
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};

    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    const key = `pushsub:${Buffer.from(endpoint).toString('base64url').slice(0, 40)}`;
    await kv.del(key);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
