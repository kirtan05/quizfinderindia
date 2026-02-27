import 'dotenv/config';
import { syncWhatsApp } from './whatsapp.js';

async function main() {
  try {
    const results = await syncWhatsApp();
    console.log(`Sync complete. ${results.length} new quizzes.`);
    return;
  } catch (err) {
    if (err.message !== 'AUTH_EXPIRED' && err.message !== 'LOGGED_OUT') throw err;
    console.log('\nSession expired. Clearing auth and waiting 30s before re-linking...\n');
  }

  // Wait for rate limit to cool down, then retry with fresh auth + QR
  await new Promise(r => setTimeout(r, 30_000));
  try {
    const results = await syncWhatsApp({ freshAuth: true });
    console.log(`Sync complete. ${results.length} new quizzes.`);
  } catch (err) {
    if (err.message === 'AUTH_EXPIRED') {
      console.error('\nWhatsApp is still blocking connections (rate limited).');
      console.error('Wait 5-10 minutes and try again: npm run sync\n');
    } else {
      throw err;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });
