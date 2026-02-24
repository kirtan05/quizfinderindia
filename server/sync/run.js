import 'dotenv/config';
import { syncWhatsApp } from './whatsapp.js';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [30_000, 60_000, 120_000]; // 30s, 60s, 2min

async function runWithRetry() {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Starting WhatsApp sync${attempt > 0 ? ` (retry ${attempt}/${MAX_RETRIES})` : ''}...`);
      const results = await syncWhatsApp();
      console.log(`Sync complete. Processed ${results.length} new quizzes.`);
      return results;
    } catch (err) {
      const is405 = err.message.includes('405') || err.message.includes('Connection closed before connecting');
      if (is405 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.log(`Connection rejected (405). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

runWithRetry()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });
