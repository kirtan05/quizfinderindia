import makeWASocket, {
  useMultiFileAuthState,
  downloadMediaMessage,
  getContentType,
  DisconnectReason,
} from 'baileys';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import QRCode from 'qrcode';
import { extractQuizFromMessage } from './extractor.js';
import { isDuplicate, findSimilarQuiz } from './dedup.js';
import { addQuiz, markMessageProcessed, getSyncState, getWaStatus, saveWaStatus, getGroupCityMap } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');
const POSTERS_DIR = path.join(__dirname, '..', '..', 'data', 'posters');

const logger = pino({ level: 'warn' });

export function getWhatsAppStatus() {
  return getWaStatus();
}

/**
 * Process a single WhatsApp message through the extraction pipeline.
 * Returns the quiz object if successfully extracted, or null.
 */
export async function processMessage(msg, groupId, threshold, sock, city) {
  const messageId = msg.key.id;
  if (isDuplicate(messageId)) return null;

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
      // Continue with just caption if image download fails
    }
  }

  if (!captionText && !imagePath) return null;

  console.log(`  Extracting from: "${(captionText || '').slice(0, 80)}..."${imagePath ? ' [+image]' : ''}`);

  const extracted = await extractQuizFromMessage(captionText, imagePath);
  if (!extracted || !extracted.name) {
    markMessageProcessed(messageId);
    return null;
  }

  // Use LLM-extracted city if available (handles cross-city posts),
  // fall back to the group's default city.
  // For online-only quizzes, use "Online" as the city.
  let quizCity = city || null;
  if (extracted.city) {
    quizCity = extracted.city;
  } else if (extracted.mode === 'online') {
    quizCity = 'Online';
  }

  const similar = findSimilarQuiz(extracted, quizCity);
  if (similar) {
    console.log(`  Skipping duplicate: "${extracted.name}" ~ "${similar.name}"`);
    markMessageProcessed(messageId);
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
  markMessageProcessed(messageId);
  return quiz;
}

export async function syncWhatsApp() {
  const groupCityMap = getGroupCityMap();
  const groupIds = Object.keys(groupCityMap);

  // Fallback: use legacy env var if config has no groups
  if (groupIds.length === 0) {
    const legacyId = process.env.WHATSAPP_GROUP_ID;
    if (!legacyId) throw new Error('No groups configured in city-groups.json and WHATSAPP_GROUP_ID not set');
    groupCityMap[legacyId] = 'Delhi';
    groupIds.push(legacyId);
  }

  const waStatus = getWaStatus();
  if (waStatus.loggedOut) {
    throw new Error('WhatsApp is logged out. Please re-scan the QR code via the admin panel.');
  }

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger,
    syncFullHistory: true,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const processedInSession = [];
    let connected = false;
    const pendingMessages = [];
    const targetGroupSet = new Set(groupIds);
    let historyDone = false;
    let historyBatches = 0;

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (targetGroupSet.has(msg.key?.remoteJid)) {
          pendingMessages.push(msg);
        }
      }
    });

    sock.ev.on('messaging-history.set', ({ messages, isLatest, progress }) => {
      historyBatches++;
      const relevant = messages.filter(m => targetGroupSet.has(m.key?.remoteJid));
      const total = messages.length;
      console.log(`[history batch #${historyBatches}] ${total} messages total, ${relevant.length} from configured groups (progress: ${progress ?? '?'}%, isLatest: ${isLatest ?? '?'})`);
      if (relevant.length > 0) {
        pendingMessages.push(...relevant);
      }
      if (isLatest) {
        historyDone = true;
      }
    });

    async function processPending() {
      for (const gid of groupIds) {
        const city = groupCityMap[gid];
        const groupMsgs = pendingMessages
          .filter(m => m.key?.remoteJid === gid)
          .sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0));

        console.log(`Processing ${groupMsgs.length} messages from ${city} group ${gid}...`);

        for (const msg of groupMsgs) {
          try {
            const quiz = await processMessage(msg, gid, threshold, sock, city);
            if (quiz) {
              processedInSession.push(quiz);
              console.log(`  [${city}] Added: "${quiz.name}" [${quiz.status}]`);
            }
          } catch (err) {
            console.error(`  Error processing message: ${err.message}`);
          }
        }
      }
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\nScan this QR code with WhatsApp:\n');
        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          saveWaStatus({ connected: false, loggedOut: true, lastSync: waStatus.lastSync, error: 'Logged out.' });
        } else {
          saveWaStatus({ connected: false, loggedOut: false, lastSync: waStatus.lastSync, error: null });
        }
        if (connected) await processPending();
        console.log(`Sync complete. Processed ${processedInSession.length} quizzes across ${groupIds.length} groups.`);
        resolve(processedInSession);
      }

      if (connection === 'open' && !connected) {
        connected = true;
        console.log(`Connected. Syncing ${groupIds.length} groups across ${[...new Set(Object.values(groupCityMap))].join(', ')}...`);
        saveWaStatus({ connected: true, loggedOut: false, lastSync: new Date().toISOString(), error: null });

        // Wait for history sync to complete (up to 2 minutes)
        console.log('Waiting for history sync...');
        const maxWait = 120_000;
        const pollInterval = 3_000;
        let waited = 0;
        let lastCount = 0;

        while (waited < maxWait) {
          await new Promise(r => setTimeout(r, pollInterval));
          waited += pollInterval;

          if (pendingMessages.length !== lastCount) {
            console.log(`  ${pendingMessages.length} relevant messages collected so far...`);
            lastCount = pendingMessages.length;
          }

          // Done if history sync says it's done, or if no new messages for 15s after at least one batch
          if (historyDone) {
            console.log('History sync complete (isLatest=true).');
            break;
          }
        }

        // Also try fetchMessageHistory for groups that still have 0 messages
        for (const gid of groupIds) {
          const count = pendingMessages.filter(m => m.key?.remoteJid === gid).length;
          if (count === 0) {
            try {
              console.log(`No history for ${groupCityMap[gid]} group, requesting explicitly...`);
              await sock.fetchMessageHistory(50, { remoteJid: gid, id: '', fromMe: false }, Math.floor(Date.now() / 1000));
            } catch (err) {
              console.log(`  fetchMessageHistory failed: ${err.message}`);
            }
          }
        }

        // Give a bit more time for any last responses
        if (!historyDone) {
          console.log('Waiting 10s more for any remaining history...');
          await new Promise(r => setTimeout(r, 10_000));
        }

        console.log(`\nHistory sync done. ${pendingMessages.length} relevant messages from ${historyBatches} batches.`);
        for (const gid of groupIds) {
          const count = pendingMessages.filter(m => m.key?.remoteJid === gid).length;
          console.log(`  ${groupCityMap[gid]}: ${count} messages`);
        }

        await processPending();
        console.log(`\nFound ${processedInSession.length} quizzes. Disconnecting...`);
        sock.end(undefined);
      }
    });
  });
}
