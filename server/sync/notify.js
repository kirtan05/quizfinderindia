// server/sync/notify.js
import webpush from 'web-push';

const VERCEL_URL = process.env.VERCEL_URL || 'https://quizfinderindia.vercel.app';
const SYNC_API_KEY = process.env.SYNC_API_KEY;

export async function sendNotifications(newQuizzes) {
  if (newQuizzes.length === 0) return;

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!vapidPublic || !vapidPrivate || !vapidSubject || !SYNC_API_KEY) {
    console.log('Push notifications not configured (missing VAPID keys or SYNC_API_KEY). Skipping.');
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  // Fetch all subscriptions from Vercel API
  let subscribers;
  try {
    const res = await fetch(`${VERCEL_URL}/api/subscribe`, {
      headers: { Authorization: `Bearer ${SYNC_API_KEY}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    subscribers = await res.json();
  } catch (err) {
    console.log(`Failed to fetch subscribers: ${err.message}`);
    return;
  }

  if (!Array.isArray(subscribers) || subscribers.length === 0) {
    console.log('No subscribers. Skipping notifications.');
    return;
  }

  console.log(`\n=== Sending notifications (${subscribers.length} subscribers, ${newQuizzes.length} new quizzes) ===\n`);

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const prefs = sub.preferences || {};

    // Filter quizzes matching this subscriber's preferences
    const matching = newQuizzes.filter(q => {
      // City match (empty array = all cities)
      if (prefs.cities?.length > 0 && !prefs.cities.includes(q.city)) return false;

      // Eligibility match (empty array = all)
      if (prefs.eligibility?.length > 0) {
        const quizElig = q.eligibilityCategories || [];
        if (!prefs.eligibility.some(e => quizElig.includes(e))) return false;
      }

      return true;
    });

    if (matching.length === 0) continue;

    // Build notification payload
    const quiz = matching[0];
    const payload = JSON.stringify({
      title: `Quiz Finder: ${matching.length} new quiz${matching.length > 1 ? 'zes' : ''}`,
      body: matching.length === 1
        ? `${quiz.name}${quiz.city ? ` (${quiz.city})` : ''}${quiz.date ? ` — ${quiz.date}` : ''}`
        : matching.map(q => q.name).slice(0, 3).join(', ') + (matching.length > 3 ? '...' : ''),
      url: matching.length === 1 ? `/#/quiz/${quiz.id}` : '/',
      tag: `sync-${new Date().toISOString().split('T')[0]}`,
    });

    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410) {
        console.log('  Expired subscription (410 Gone).');
      }
    }
  }

  console.log(`Notifications: ${sent} sent, ${failed} failed.\n`);
}
