import 'dotenv/config';
import { syncWhatsApp } from './whatsapp.js';

console.log('Starting WhatsApp sync...');
syncWhatsApp()
  .then((results) => {
    console.log(`Sync complete. Processed ${results.length} new quizzes.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
