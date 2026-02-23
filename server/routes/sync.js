import { Router } from 'express';
import { rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';
import { syncWhatsApp, getWhatsAppStatus } from '../sync/whatsapp.js';
import { saveWaStatus } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');

const router = Router();

let isSyncing = false;

router.post('/trigger', requireAuth, async (req, res) => {
  if (isSyncing) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  isSyncing = true;
  try {
    const results = await syncWhatsApp();
    res.json({ success: true, processed: results.length });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', message: err.message });
  } finally {
    isSyncing = false;
  }
});

router.get('/status', requireAuth, (req, res) => {
  try {
    const status = getWhatsAppStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status', message: err.message });
  }
});

router.post('/reconnect', requireAuth, (req, res) => {
  try {
    // Clear the auth directory to force a new QR code session
    if (existsSync(AUTH_DIR)) {
      rmSync(AUTH_DIR, { recursive: true, force: true });
    }

    // Reset the status
    saveWaStatus({
      connected: false,
      loggedOut: false,
      lastSync: null,
      error: null,
    });

    res.json({
      success: true,
      message: 'Auth session cleared. Trigger a sync to generate a new QR code in the terminal.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Reconnect failed', message: err.message });
  }
});

export default router;
