// server/sync/notify.js
// Hands new quizzes to the site's /api/notify Function (client/functions/api/notify.js),
// which matches them to subscribers and sends the pushes. Never throws.

export async function sendNotifications(newQuizzes) {
  if (newQuizzes.length === 0) return;
  try { process.loadEnvFile(new URL('../../.env', import.meta.url)); } catch { /* no .env */ }

  const secret = process.env.NOTIFY_SECRET;
  if (!secret) {
    console.log('Push notifications not configured (NOTIFY_SECRET not set). Skipping.');
    return;
  }

  const site = process.env.SITE_URL || 'https://quizfinder.pages.dev';
  const total = { sent: 0, failed: 0, removed: 0 };
  try {
    let cursor;
    // The Function sends a small batch per call and returns the cursor to resume from (null when done).
    for (let round = 0; round < 200; round++) {
      const res = await fetch(`${site}/api/notify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizzes: newQuizzes, cursor }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = await res.json();
      for (const k in total) total[k] += r[k];
      if (!(cursor = r.cursor)) break;
    }
    console.log(`Notifications: ${total.sent} sent, ${total.failed} failed, ${total.removed} expired subscription(s) removed.`);
  } catch (err) {
    console.log(`Push notifications failed: ${err.message}`);
  }
}
