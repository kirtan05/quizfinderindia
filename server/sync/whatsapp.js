import makeWASocket, {
  useMultiFileAuthState,
  downloadMediaMessage,
  getContentType,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} from 'baileys';
import { writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import QRCode from 'qrcode';
import { extractQuizFromMessage } from './extractor.js';
import { isDuplicate, findSimilarQuiz } from './dedup.js';
import { addQuiz, markMessageProcessed, getWaStatus, saveWaStatus, getGroupCityMap } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');
const POSTERS_DIR = path.join(__dirname, '..', '..', 'data', 'posters');

const logger = pino({ level: 'warn' });

export function getWhatsAppStatus() {
  return getWaStatus();
}

// ────────────────────────────────────────────────
// Merge consecutive image + text from same sender
// ────────────────────────────────────────────────

function mergeConsecutiveMessages(messages) {
  if (messages.length <= 1) return messages;

  const sorted = [...messages].sort((a, b) => {
    const gCmp = (a.key?.remoteJid || '').localeCompare(b.key?.remoteJid || '');
    if (gCmp !== 0) return gCmp;
    return Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0);
  });

  const WINDOW = 120; // seconds
  const merged = [];
  let i = 0;

  while (i < sorted.length) {
    const cur = sorted[i];
    const curType = getContentType(cur.message);
    const curSender = cur.key?.participant || cur.key?.remoteJid;
    const curTs = Number(cur.messageTimestamp || 0);

    if (i + 1 < sorted.length) {
      const nxt = sorted[i + 1];
      const nxtType = getContentType(nxt.message);
      const nxtSender = nxt.key?.participant || nxt.key?.remoteJid;
      const nxtTs = Number(nxt.messageTimestamp || 0);

      const canMerge =
        cur.key?.remoteJid === nxt.key?.remoteJid &&
        curSender === nxtSender &&
        Math.abs(nxtTs - curTs) <= WINDOW;

      if (canMerge) {
        const isImgThenTxt =
          curType === 'imageMessage' && !cur.message.imageMessage?.caption &&
          (nxtType === 'conversation' || nxtType === 'extendedTextMessage');
        const isTxtThenImg =
          (curType === 'conversation' || curType === 'extendedTextMessage') &&
          nxtType === 'imageMessage' && !nxt.message.imageMessage?.caption;

        if (isImgThenTxt || isTxtThenImg) {
          const imgMsg = isImgThenTxt ? cur : nxt;
          const txtMsg = isImgThenTxt ? nxt : cur;
          const text = txtMsg.message.conversation || txtMsg.message.extendedTextMessage?.text;
          const clone = structuredClone(imgMsg);
          clone.message.imageMessage.caption = text;
          clone._mergedIds = [cur.key?.id, nxt.key?.id];
          merged.push(clone);
          i += 2;
          continue;
        }
      }
    }
    merged.push(cur);
    i++;
  }

  const count = messages.length - merged.length;
  if (count > 0) console.log(`Merged ${count} consecutive image+text pairs.`);
  return merged;
}

// ────────────────────────────────────────────────
// Process a single message through GPT-4o
// ────────────────────────────────────────────────

export async function processMessage(msg, groupId, threshold, sock, city) {
  const messageId = msg.key.id;
  const allIds = msg._mergedIds || [messageId];
  if (allIds.every(id => isDuplicate('whatsapp', id))) return null;

  const contentType = getContentType(msg.message);
  let captionText = null;
  let imagePath = null;

  if (contentType === 'conversation') {
    captionText = msg.message.conversation;
  } else if (contentType === 'extendedTextMessage') {
    captionText = msg.message.extendedTextMessage?.text;
  } else if (contentType === 'imageMessage') {
    captionText = msg.message.imageMessage?.caption;
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        reuploadRequest: sock.updateMediaMessage,
      });
      const filename = `${uuidv4()}.jpg`;
      imagePath = path.join(POSTERS_DIR, filename);
      writeFileSync(imagePath, buffer);
    } catch (err) {
      console.log(`  Failed to download image: ${err.message}`);
    }
  }

  if (!captionText && !imagePath) return null;

  console.log(`  Extracting: "${(captionText || '').slice(0, 80)}..."${imagePath ? ' [+image]' : ''}`);

  const extracted = await extractQuizFromMessage(captionText, imagePath);
  if (!extracted || !extracted.name) {
    allIds.forEach(id => markMessageProcessed(id));
    return null;
  }

  let quizCity = city || null;
  if (extracted.city) quizCity = extracted.city;
  else if (extracted.mode === 'online') quizCity = 'Online';

  const similar = findSimilarQuiz(extracted, quizCity);
  if (similar) {
    console.log(`  Skip duplicate: "${extracted.name}" ~ "${similar.name}"`);
    allIds.forEach(id => markMessageProcessed(id));
    return null;
  }

  const quiz = {
    id: uuidv4(),
    status: extracted.confidence >= threshold ? 'published' : 'flagged',
    confidence: extracted.confidence,
    name: extracted.name,
    description: extracted.description || '',
    date: extracted.date,
    time: extracted.time,
    venue: extracted.venue,
    venueMapLink: extracted.venueMapLink,
    eligibility: extracted.eligibility || [],
    eligibilityCategories: extracted.eligibilityCategories || [],
    hostingOrg: extracted.hostingOrg,
    quizMasters: extracted.quizMasters || [],
    poc: extracted.poc || { name: null, phone: null, whatsapp: null },
    regLink: extracted.regLink,
    instagramLink: extracted.instagramLink,
    teamSize: extracted.teamSize ?? null,
    crossCollege: extracted.crossCollege ?? null,
    mode: extracted.mode || 'offline',
    city: quizCity,
    source: 'whatsapp',
    sourceId: `whatsapp:${messageId}`,
    sourceGroupId: groupId,
    posterImage: imagePath ? `posters/${path.basename(imagePath)}` : null,
    sourceCaption: captionText || null,
    sourceMessageId: messageId,
    sourceTimestamp: msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    extractedFields: extracted.extractedFields || [],
  };

  addQuiz(quiz);
  allIds.forEach(id => markMessageProcessed(id));
  return quiz;
}

// ────────────────────────────────────────────────
// Main sync — connect, collect, extract, disconnect
// ────────────────────────────────────────────────

export async function syncWhatsApp({ freshAuth = false } = {}) {
  const groupCityMap = getGroupCityMap();
  const groupIds = Object.keys(groupCityMap);

  if (groupIds.length === 0) {
    const legacyId = process.env.WHATSAPP_GROUP_ID;
    if (!legacyId) throw new Error('No groups configured');
    groupCityMap[legacyId] = 'Delhi';
    groupIds.push(legacyId);
  }

  // Clear auth if requested (forces QR re-scan)
  if (freshAuth && existsSync(AUTH_DIR)) {
    rmSync(AUTH_DIR, { recursive: true });
    console.log('Cleared old auth. You will need to scan a QR code.');
  }

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: true,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const results = [];
    let connected = false;
    const collected = new Map(); // msgId -> msg
    const targetGroups = new Set(groupIds);
    let lastActivity = Date.now();

    function collect(msg) {
      if (!targetGroups.has(msg.key?.remoteJid)) return;
      const id = msg.key?.id;
      if (id && !collected.has(id)) {
        collected.set(id, msg);
        lastActivity = Date.now();
      }
    }

    sock.ev.on('messaging-history.set', ({ messages, isLatest, progress }) => {
      let n = 0;
      for (const m of messages) { if (targetGroups.has(m.key?.remoteJid)) { collect(m); n++; } }
      console.log(`[history] ${messages.length} total, ${n} relevant (${progress ?? '?'}%)`);
    });

    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const m of messages) collect(m);
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n--- Scan this QR code with WhatsApp ---\n');
        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
        console.log('Waiting for scan...\n');
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          saveWaStatus({ connected: false, loggedOut: true, lastSync: null, error: 'Logged out' });
          reject(new Error('LOGGED_OUT'));
          return;
        }

        if (code === 405 && !connected) {
          saveWaStatus({ connected: false, loggedOut: false, lastSync: null, error: '405' });
          reject(new Error('AUTH_EXPIRED'));
          return;
        }

        // 515 = restart required (normal after QR scan). Reconnect.
        if (code === DisconnectReason.restartRequired || code === 515) {
          console.log('Restart required — reconnecting...');
          resolve(syncWhatsApp());
          return;
        }

        if (!connected) {
          reject(new Error(`Connection failed (${code})`));
          return;
        }
        // If we were connected, we already resolved below
      }

      if (connection === 'open' && !connected) {
        connected = true;
        const cities = [...new Set(Object.values(groupCityMap))].join(', ');
        console.log(`Connected! Syncing ${groupIds.length} groups (${cities})`);
        saveWaStatus({ connected: true, loggedOut: false, lastSync: new Date().toISOString(), error: null });

        try {
          // Wait for automatic offline messages
          console.log('Collecting messages...');
          await idle(12_000);

          // Request history for each group
          for (const gid of groupIds) {
            try {
              await sock.fetchMessageHistory(50, { remoteJid: gid, id: '', fromMe: false }, Math.floor(Date.now() / 1000));
            } catch {}
          }
          await idle(15_000);

          // Log what we got
          console.log(`\nCollected ${collected.size} messages.`);
          for (const gid of groupIds) {
            const n = [...collected.values()].filter(m => m.key?.remoteJid === gid).length;
            console.log(`  ${groupCityMap[gid]}: ${n}`);
          }

          // Merge consecutive image+text
          const all = mergeConsecutiveMessages([...collected.values()]);

          // Extract
          console.log(`\nProcessing ${all.length} messages...\n`);
          for (const gid of groupIds) {
            const city = groupCityMap[gid];
            const msgs = all
              .filter(m => m.key?.remoteJid === gid)
              .sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0));
            if (!msgs.length) continue;

            console.log(`[${city}] ${msgs.length} messages`);
            for (const msg of msgs) {
              try {
                const quiz = await processMessage(msg, gid, threshold, sock, city);
                if (quiz) {
                  results.push(quiz);
                  console.log(`  + "${quiz.name}" [${quiz.status}]`);
                }
              } catch (err) {
                console.error(`  Error: ${err.message}`);
              }
            }
          }

          console.log(`\nDone. ${results.length} new quizzes.`);
          saveWaStatus({ connected: false, loggedOut: false, lastSync: new Date().toISOString(), error: null });
          sock.end(undefined);
          resolve(results);
        } catch (err) {
          sock.end(undefined);
          reject(err);
        }
      }
    });

    // Wait until no new messages for `ms` milliseconds
    function idle(ms) {
      return new Promise(res => {
        lastActivity = Date.now();
        const check = setInterval(() => {
          if (Date.now() - lastActivity >= ms) { clearInterval(check); res(); }
        }, 2000);
        // Hard cap at 3x
        setTimeout(() => { clearInterval(check); res(); }, ms * 3);
      });
    }
  });
}
