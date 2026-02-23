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
import { addQuiz, markMessageProcessed, getSyncState, getWaStatus, saveWaStatus } from '../store.js';

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
async function processMessage(msg, groupId, threshold, sock) {
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

  const similar = findSimilarQuiz(extracted);
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
    posterImage: imagePath ? `posters/${path.basename(imagePath)}` : null,
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
  const groupId = process.env.WHATSAPP_GROUP_ID;
  if (!groupId) throw new Error('WHATSAPP_GROUP_ID not set in .env');

  const waStatus = getWaStatus();
  if (waStatus.loggedOut) {
    throw new Error(
      'WhatsApp is logged out. Please re-scan the QR code via the admin panel.'
    );
  }

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const processedInSession = [];
    let timeout;
    let historyReceived = false;
    let connected = false;
    const pendingMessages = []; // Queue messages that arrive before we're ready

    // Process all queued messages
    async function processPending() {
      const groupMsgs = pendingMessages
        .filter(m => m.key?.remoteJid === groupId)
        .sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0));

      console.log(`Processing ${groupMsgs.length} messages from group...`);

      for (const msg of groupMsgs) {
        try {
          const quiz = await processMessage(msg, groupId, threshold, sock);
          if (quiz) {
            processedInSession.push(quiz);
            console.log(`  Added quiz: "${quiz.name}" [${quiz.status}] (${Math.round(quiz.confidence * 100)}%)`);
          }
        } catch (err) {
          console.error(`  Error processing message: ${err.message}`);
        }
      }
    }

    // Listen for real-time messages (works for regular groups)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        if (msg.key?.remoteJid === groupId) {
          console.log(`[messages.upsert] Got message from group (type=${type})`);
          pendingMessages.push(msg);
        }
      }
    });

    // Listen for history sync messages (works for community sub-groups)
    sock.ev.on('messaging-history.set', ({ messages, syncType }) => {
      const groupMsgs = messages.filter(m => m.key?.remoteJid === groupId);
      if (groupMsgs.length > 0) {
        console.log(`[messaging-history.set] Got ${groupMsgs.length} messages from group (syncType=${syncType})`);
        pendingMessages.push(...groupMsgs);
        historyReceived = true;
      }
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
          console.log('WhatsApp logged out — QR re-scan required');
          saveWaStatus({
            connected: false,
            loggedOut: true,
            lastSync: waStatus.lastSync,
            error: 'Logged out from WhatsApp. QR re-scan required.',
          });
        } else {
          saveWaStatus({
            connected: false,
            loggedOut: false,
            lastSync: waStatus.lastSync,
            error: null,
          });
        }
        clearTimeout(timeout);

        // Process whatever we have before resolving
        if (connected) {
          await processPending();
        }
        console.log(`Sync complete. Processed ${processedInSession.length} quizzes.`);
        resolve(processedInSession);
      }

      if (connection === 'open' && !connected) {
        connected = true;
        console.log('Connected to WhatsApp');
        saveWaStatus({
          connected: true,
          loggedOut: false,
          lastSync: new Date().toISOString(),
          error: null,
        });

        // Wait for initial history sync events (5s), then try fetchMessageHistory
        console.log('Waiting 5s for initial history sync...');
        await new Promise(r => setTimeout(r, 5000));

        if (pendingMessages.filter(m => m.key?.remoteJid === groupId).length === 0) {
          console.log('No messages from initial sync, trying fetchMessageHistory...');
          try {
            await sock.fetchMessageHistory(
              20,
              { remoteJid: groupId, id: '', fromMe: false },
              Math.floor(Date.now() / 1000)
            );
            // Wait for history response
            console.log('Waiting 15s for fetchMessageHistory response...');
            await new Promise(r => setTimeout(r, 15000));
          } catch (err) {
            console.log('fetchMessageHistory not available:', err.message);
          }
        }

        // If still no messages, wait a bit more for any remaining sync
        if (pendingMessages.filter(m => m.key?.remoteJid === groupId).length === 0) {
          console.log('Waiting 10s more for any late sync events...');
          await new Promise(r => setTimeout(r, 10000));
        }

        // Process everything we have and disconnect
        await processPending();
        console.log(`Found ${processedInSession.length} quizzes. Disconnecting...`);
        sock.end(undefined);
      }
    });
  });
}
