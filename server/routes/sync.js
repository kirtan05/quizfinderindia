import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { syncWhatsApp } from '../sync/whatsapp.js';

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

export default router;
