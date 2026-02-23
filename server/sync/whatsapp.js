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
import { extractQuizFromMessage } from './extractor.js';
import { isDuplicate, findSimilarQuiz } from './dedup.js';
import { addQuiz, markMessageProcessed, getSyncState } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'auth_info_baileys');
const POSTERS_DIR = path.join(__dirname, '..', '..', 'data', 'posters');

const logger = pino({ level: 'warn' });

export async function syncWhatsApp() {
  const groupId = process.env.WHATSAPP_GROUP_ID;
  if (!groupId) throw new Error('WHATSAPP_GROUP_ID not set in .env');

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const processedInSession = [];
    let timeout;

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log('Connection closed, will resolve with what we have');
        }
        clearTimeout(timeout);
        resolve(processedInSession);
      }

      if (connection === 'open') {
        console.log('Connected to WhatsApp');
        timeout = setTimeout(() => {
          console.log('Sync window complete, disconnecting');
          sock.end(undefined);
        }, 30000);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        try {
          const chatId = msg.key.remoteJid;
          if (chatId !== groupId) continue;

          const messageId = msg.key.id;
          if (isDuplicate(messageId)) continue;

          const contentType = getContentType(msg.message);
          let captionText = null;
          let imagePath = null;

          if (contentType === 'conversation') {
            captionText = msg.message.conversation;
          } else if (contentType === 'extendedTextMessage') {
            captionText = msg.message.extendedTextMessage?.text;
          } else if (contentType === 'imageMessage') {
            captionText = msg.message.imageMessage?.caption;

            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              reuploadRequest: sock.updateMediaMessage,
            });
            const filename = `${uuidv4()}.jpg`;
            imagePath = path.join(POSTERS_DIR, filename);
            writeFileSync(imagePath, buffer);
          }

          if (!captionText && !imagePath) continue;

          const extracted = await extractQuizFromMessage(captionText, imagePath);
          if (!extracted || !extracted.name) {
            markMessageProcessed(messageId);
            continue;
          }

          const similar = findSimilarQuiz(extracted);
          if (similar) {
            console.log(`Skipping potential duplicate: "${extracted.name}" similar to "${similar.name}"`);
            markMessageProcessed(messageId);
            continue;
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
            posterImage: imagePath ? `posters/${path.basename(imagePath)}` : null,
            sourceMessageId: messageId,
            sourceTimestamp: new Date(msg.messageTimestamp * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            extractedFields: extracted.extractedFields || [],
          };

          addQuiz(quiz);
          markMessageProcessed(messageId);
          processedInSession.push(quiz);

          console.log(`Added quiz: "${quiz.name}" [${quiz.status}] (confidence: ${quiz.confidence})`);
        } catch (err) {
          console.error('Error processing message:', err.message);
        }
      }
    });
  });
}
