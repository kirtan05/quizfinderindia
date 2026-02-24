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
 * Merge consecutive messages from the same sender in the same group
 * within a time window. Combines image-only + text-only pairs into
 * a single virtual message for better extraction.
 */
function mergeConsecutiveMessages(messages) {
  if (messages.length <= 1) return messages;

  // Sort by group, then timestamp
  const sorted = [...messages].sort((a, b) => {
    const gCmp = (a.key?.remoteJid || '').localeCompare(b.key?.remoteJid || '');
    if (gCmp !== 0) return gCmp;
    return Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0);
  });

  const MERGE_WINDOW_SEC = 120; // 2 minutes
  const merged = [];
  let i = 0;

  while (i < sorted.length) {
    const current = sorted[i];
    const currentType = getContentType(current.message);
    const currentJid = current.key?.remoteJid;
    const currentSender = current.key?.participant || current.key?.remoteJid;
    const currentTs = Number(current.messageTimestamp || 0);

    // Look ahead for a merge candidate
    let didMerge = false;
    if (i + 1 < sorted.length) {
      const next = sorted[i + 1];
      const nextType = getContentType(next.message);
      const nextJid = next.key?.remoteJid;
      const nextSender = next.key?.participant || next.key?.remoteJid;
      const nextTs = Number(next.messageTimestamp || 0);

      const sameGroup = currentJid === nextJid;
      const sameSender = currentSender === nextSender;
      const withinWindow = Math.abs(nextTs - currentTs) <= MERGE_WINDOW_SEC;

      if (sameGroup && sameSender && withinWindow) {
        const isImageThenText =
          currentType === 'imageMessage' && !current.message.imageMessage?.caption &&
          (nextType === 'conversation' || nextType === 'extendedTextMessage');

        const isTextThenImage =
          (currentType === 'conversation' || currentType === 'extendedTextMessage') &&
          nextType === 'imageMessage' && !next.message.imageMessage?.caption;

        if (isImageThenText) {
          // Merge: inject text as caption on the image message
          const textContent = nextType === 'conversation'
            ? next.message.conversation
            : next.message.extendedTextMessage?.text;
          const clone = structuredClone(current);
          clone.message.imageMessage.caption = textContent;
          clone._mergedFrom = [current.key?.id, next.key?.id];
          merged.push(clone);
          i += 2;
          didMerge = true;
        } else if (isTextThenImage) {
          // Merge: inject text as caption on the image message
          const textContent = currentType === 'conversation'
            ? current.message.conversation
            : current.message.extendedTextMessage?.text;
          const clone = structuredClone(next);
          clone.message.imageMessage.caption = textContent;
          clone._mergedFrom = [current.key?.id, next.key?.id];
          merged.push(clone);
          i += 2;
          didMerge = true;
        }
      }
    }

    if (!didMerge) {
      merged.push(current);
      i++;
    }
  }

  const mergeCount = messages.length - merged.length;
  if (mergeCount > 0) {
    console.log(`Merged ${mergeCount} consecutive image+text message pairs.`);
  }
  return merged;
}

/**
 * Process a single WhatsApp message through the extraction pipeline.
 * Returns the quiz object if successfully extracted, or null.
 */
export async function processMessage(msg, groupId, threshold, sock, city) {
  const messageId = msg.key.id;

  // For merged messages, check all source IDs
  const sourceIds = msg._mergedFrom || [messageId];
  if (sourceIds.every(id => isDuplicate(id))) return null;

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

  console.log(`  Extracting from: "${(captionText || '').slice(0, 80)}..."${imagePath ? ' [+image]' : ''}`);

  const extracted = await extractQuizFromMessage(captionText, imagePath);
  if (!extracted || !extracted.name) {
    sourceIds.forEach(id => markMessageProcessed(id));
    return null;
  }

  let quizCity = city || null;
  if (extracted.city) {
    quizCity = extracted.city;
  } else if (extracted.mode === 'online') {
    quizCity = 'Online';
  }

  const similar = findSimilarQuiz(extracted, quizCity);
  if (similar) {
    console.log(`  Skipping duplicate: "${extracted.name}" ~ "${similar.name}"`);
    sourceIds.forEach(id => markMessageProcessed(id));
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
  sourceIds.forEach(id => markMessageProcessed(id));
  return quiz;
}

export async function syncWhatsApp() {
  const groupCityMap = getGroupCityMap();
  const groupIds = Object.keys(groupCityMap);

  if (groupIds.length === 0) {
    const legacyId = process.env.WHATSAPP_GROUP_ID;
    if (!legacyId) throw new Error('No groups configured in city-groups.json and WHATSAPP_GROUP_ID not set');
    groupCityMap[legacyId] = 'Delhi';
    groupIds.push(legacyId);
  }

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: ['Quiz Finder', 'Chrome', '10.0'],
    syncFullHistory: true,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const processedInSession = [];
    let connected = false;
    const collectedMessages = new Map(); // messageId -> msg (deduped)
    const targetGroupSet = new Set(groupIds);
    let historyBatches = 0;
    let historyDone = false;
    let lastMessageTime = 0;

    function collectMessage(msg) {
      if (!targetGroupSet.has(msg.key?.remoteJid)) return;
      const id = msg.key?.id;
      if (id && !collectedMessages.has(id)) {
        collectedMessages.set(id, msg);
        lastMessageTime = Date.now();
      }
    }

    // Collect from history sync (fires on first link, or for offline messages)
    sock.ev.on('messaging-history.set', ({ messages, isLatest, progress }) => {
      historyBatches++;
      let relevant = 0;
      for (const m of messages) {
        if (targetGroupSet.has(m.key?.remoteJid)) {
          collectMessage(m);
          relevant++;
        }
      }
      console.log(`[history #${historyBatches}] ${messages.length} total, ${relevant} relevant (progress: ${progress ?? '?'}%)`);
      if (isLatest) historyDone = true;
    });

    // Collect from real-time messages
    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) collectMessage(msg);
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\nScan this QR code with WhatsApp:\n');
        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          saveWaStatus({ connected: false, loggedOut: true, lastSync: null, error: 'Logged out. Re-scan QR.' });
          reject(new Error('WhatsApp logged out. Delete auth_info_baileys/ and re-link.'));
        } else if (!connected) {
          // Never connected — retry or fail
          saveWaStatus({ connected: false, loggedOut: false, lastSync: null, error: 'Connection failed' });
          reject(new Error(`Connection closed before connecting (status: ${statusCode})`));
        }
        // If connected=true, we already resolved in the open handler
      }

      if (connection === 'open' && !connected) {
        connected = true;
        const cities = [...new Set(Object.values(groupCityMap))].join(', ');
        console.log(`Connected. Syncing ${groupIds.length} groups across ${cities}...`);
        saveWaStatus({ connected: true, loggedOut: false, lastSync: new Date().toISOString(), error: null });

        try {
          // Phase 1: Wait for any automatic history sync (offline messages)
          console.log('Waiting for history sync + offline messages...');
          await waitForMessages(15_000);

          // Phase 2: Explicitly request history for each group
          console.log('Requesting message history for each group...');
          for (const gid of groupIds) {
            try {
              await sock.fetchMessageHistory(
                50,
                { remoteJid: gid, id: '', fromMe: false },
                Math.floor(Date.now() / 1000)
              );
            } catch (err) {
              console.log(`  fetchMessageHistory failed for ${groupCityMap[gid]}: ${err.message}`);
            }
          }

          // Phase 3: Wait for responses from fetchMessageHistory
          await waitForMessages(20_000);

          // Summary
          console.log(`\nCollected ${collectedMessages.size} unique messages from ${historyBatches} history batches.`);
          for (const gid of groupIds) {
            const count = [...collectedMessages.values()].filter(m => m.key?.remoteJid === gid).length;
            console.log(`  ${groupCityMap[gid]}: ${count} messages`);
          }

          // Phase 4: Merge consecutive image+text messages
          const allMessages = [...collectedMessages.values()];
          const mergedMessages = mergeConsecutiveMessages(allMessages);

          // Phase 5: Process through extraction pipeline
          console.log(`\nProcessing ${mergedMessages.length} messages through extraction...`);
          for (const gid of groupIds) {
            const city = groupCityMap[gid];
            const groupMsgs = mergedMessages
              .filter(m => m.key?.remoteJid === gid)
              .sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0));

            if (groupMsgs.length === 0) continue;
            console.log(`\n[${city}] Processing ${groupMsgs.length} messages...`);

            for (const msg of groupMsgs) {
              try {
                const quiz = await processMessage(msg, gid, threshold, sock, city);
                if (quiz) {
                  processedInSession.push(quiz);
                  console.log(`  + "${quiz.name}" [${quiz.status}]`);
                }
              } catch (err) {
                console.error(`  Error: ${err.message}`);
              }
            }
          }

          console.log(`\nSync complete. ${processedInSession.length} new quizzes found.`);
          saveWaStatus({ connected: false, loggedOut: false, lastSync: new Date().toISOString(), error: null });
          sock.end(undefined);
          resolve(processedInSession);

        } catch (err) {
          console.error('Sync error:', err.message);
          saveWaStatus({ connected: false, loggedOut: false, lastSync: null, error: err.message });
          sock.end(undefined);
          reject(err);
        }
      }
    });

    // Helper: wait until no new messages arrive for `quietMs`
    function waitForMessages(quietMs) {
      return new Promise(resolve => {
        lastMessageTime = Date.now();
        const maxWait = quietMs * 3; // absolute max
        const start = Date.now();

        const interval = setInterval(() => {
          const elapsed = Date.now() - start;
          const sinceLast = Date.now() - lastMessageTime;

          if (sinceLast >= quietMs || elapsed >= maxWait) {
            clearInterval(interval);
            resolve();
          }
        }, 2000);
      });
    }
  });
}
