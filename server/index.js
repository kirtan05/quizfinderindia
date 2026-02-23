import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { setupSecurity } from './middleware/security.js';
import quizRoutes from './routes/quizzes.js';
import syncRoutes from './routes/sync.js';
import { syncWhatsApp } from './sync/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Security
setupSecurity(app);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// API routes
app.use('/api/quizzes', quizRoutes);
app.use('/api/sync', syncRoutes);

// Serve poster images
app.use('/posters', express.static(path.join(__dirname, '..', 'data', 'posters')));

// Serve React build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('{*path}', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/posters')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Cron sync
const interval = process.env.SYNC_INTERVAL_MINUTES || 30;
cron.schedule(`*/${interval} * * * *`, async () => {
  console.log('Cron: starting WhatsApp sync...');
  try {
    const results = await syncWhatsApp();
    console.log(`Cron: synced ${results.length} new quizzes`);
  } catch (err) {
    console.error('Cron sync failed:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`DQC server running on http://localhost:${PORT}`);
});
