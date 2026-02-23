import { Router } from 'express';
import { rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { requireAuth } from '../middleware/auth.js';
import { syncWhatsApp, getWhatsAppStatus, processMessage } from '../sync/whatsapp.js';
import { saveWaStatus, getWaGroups, getWaStatus, getGroupCityMap } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');

const router = Router();

let isSyncing = false;
let activeConnection = null;

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
    // Include the current group name from cached groups
    const groupId = process.env.WHATSAPP_GROUP_ID;
    let groupName = null;
    if (groupId) {
      const groups = getWaGroups();
      if (groups) {
        const match = groups.find(g => g.id === groupId);
        if (match) groupName = match.name;
      }
    }
    res.json({ ...status, groupId, groupName });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status', message: err.message });
  }
});

// Return cached groups (no WhatsApp connection needed)
router.get('/groups', requireAuth, (req, res) => {
  const groups = getWaGroups();
  if (!groups) {
    return res.status(404).json({ error: 'No cached groups. Connect WhatsApp first.' });
  }
  res.json(groups);
});

// SSE endpoint: starts WhatsApp connection, streams QR codes + status events
router.get('/connect', requireAuth, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  function send(event, data) {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  }

  if (activeConnection) {
    try { activeConnection.end(undefined); } catch {}
    activeConnection = null;
  }

  let ended = false;
  let currentSock = null;

  function cleanup() {
    if (ended) return;
    ended = true;
    try { if (currentSock) currentSock.end(undefined); } catch {}
    activeConnection = null;
    try { res.end(); } catch {}
  }

  req.on('close', cleanup);

  async function startSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const sock = makeWASocket({ auth: state, logger: pino({ level: 'warn' }), syncFullHistory: true });
    currentSock = sock;
    activeConnection = sock;

    sock.ev.on('creds.update', saveCreds);

    // Collect history messages for processing
    const groupCityMap = getGroupCityMap();
    const targetGroupSet = new Set(Object.keys(groupCityMap));
    const historyMessages = [];
    let historyBatches = 0;

    sock.ev.on('messaging-history.set', ({ messages, isLatest, progress }) => {
      historyBatches++;
      const relevant = messages.filter(m => targetGroupSet.has(m.key?.remoteJid));
      if (relevant.length > 0) {
        historyMessages.push(...relevant);
      }
      if (!ended) send('status', { status: 'syncing', message: `History batch #${historyBatches}: ${historyMessages.length} relevant messages (${progress ?? '?'}%)` });
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (targetGroupSet.has(msg.key?.remoteJid)) {
          historyMessages.push(msg);
        }
      }
    });

    let groupTimeout;

    sock.ev.on('connection.update', async (update) => {
      if (ended) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        send('qr', { qr: dataUrl });
      }

      if (connection === 'open') {
        send('status', { status: 'connected', message: 'WhatsApp connected! Waiting for history sync...' });

        saveWaStatus({
          connected: true,
          loggedOut: false,
          lastSync: new Date().toISOString(),
          error: null,
        });

        // Wait for history sync (up to 90s, checking every 3s)
        let waited = 0;
        let lastCount = 0;
        while (waited < 90000 && !ended) {
          await new Promise(r => setTimeout(r, 3000));
          waited += 3000;
          if (historyMessages.length !== lastCount) {
            lastCount = historyMessages.length;
            send('status', { status: 'syncing', message: `Collecting messages: ${historyMessages.length} so far...` });
          }
          // If no new messages for 15s after at least one batch, consider done
          if (historyBatches > 0 && historyMessages.length === lastCount && waited > 15000) break;
        }

        send('status', { status: 'syncing', message: `History sync done. ${historyMessages.length} messages from ${historyBatches} batches. Processing...` });

        // Process collected history messages through extraction pipeline
        if (historyMessages.length > 0 && targetGroupSet.size > 0) {
          const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;
          let extracted = 0;
          for (const gid of Object.keys(groupCityMap)) {
            const city = groupCityMap[gid];
            const msgs = historyMessages
              .filter(m => m.key?.remoteJid === gid)
              .sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0));
            for (const msg of msgs) {
              try {
                const quiz = await processMessage(msg, gid, threshold, sock, city);
                if (quiz) {
                  extracted++;
                  send('status', { status: 'extracting', message: `Extracted: "${quiz.name}" [${city}]` });
                }
              } catch {}
            }
          }
          send('status', { status: 'syncing', message: `Extracted ${extracted} quizzes from history.` });
        }

        // Close after 5s
        groupTimeout = setTimeout(() => {
          send('status', { status: 'done', message: 'Session complete' });
          cleanup();
        }, 5000);
      }

      if (connection === 'close') {
        clearTimeout(groupTimeout);
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (statusCode === DisconnectReason.loggedOut) {
          // Stale auth — clear it and start fresh with a new QR
          send('status', { status: 'clearing', message: 'Clearing old session, generating new QR...' });
          try { if (existsSync(AUTH_DIR)) rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
          saveWaStatus({ connected: false, loggedOut: false, lastSync: null, error: null });

          if (!ended) {
            // Restart with clean auth — will show a fresh QR
            try { await startSocket(); } catch (err) {
              send('error', { message: 'Reconnect failed: ' + err.message });
              cleanup();
            }
          }
        } else if (shouldReconnect && statusCode === DisconnectReason.restartRequired) {
          // Normal restart cycle after QR scan — reconnect silently
          if (!ended) {
            try { await startSocket(); } catch (err) {
              send('error', { message: 'Restart failed: ' + err.message });
              cleanup();
            }
          }
        } else {
          // Other close reasons — just end cleanly
          send('status', { status: 'closed', message: 'Connection closed' });
          cleanup();
        }
      }
    });
  }

  try {
    await startSocket();
  } catch (err) {
    send('error', { message: err.message });
    try { res.end(); } catch {}
  }
});

router.post('/reconnect', requireAuth, (req, res) => {
  try {
    if (activeConnection) {
      try { activeConnection.end(undefined); } catch {}
      activeConnection = null;
    }

    if (existsSync(AUTH_DIR)) {
      rmSync(AUTH_DIR, { recursive: true, force: true });
    }

    saveWaStatus({
      connected: false,
      loggedOut: false,
      lastSync: null,
      error: null,
    });

    res.json({
      success: true,
      message: 'Auth session cleared. Use "Connect WhatsApp" to scan a new QR code.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Reconnect failed', message: err.message });
  }
});

// Set the group ID from the admin panel
router.post('/set-group', requireAuth, (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId is required' });

  const envPath = path.join(__dirname, '..', '..', '.env');
  try {
    const envContent = readFileSync(envPath, 'utf-8');
    const updated = envContent.replace(
      /^WHATSAPP_GROUP_ID=.*$/m,
      `WHATSAPP_GROUP_ID=${groupId}`
    );
    writeFileSync(envPath, updated);
    process.env.WHATSAPP_GROUP_ID = groupId;
    res.json({ success: true, message: `Group ID set to ${groupId}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set group ID', message: err.message });
  }
});

export default router;
