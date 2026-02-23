# DQC Quiz Aggregator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local web app that syncs quiz announcements from a DQC WhatsApp group, extracts structured details via OpenAI, and displays them on a filterable card grid.

**Architecture:** Monorepo with Express backend (Baileys WhatsApp sync + OpenAI extraction + REST API) and React Vite frontend. JSON file storage. Cron-based periodic sync. Token-protected admin routes.

**Tech Stack:** Node.js, Express, Baileys, OpenAI API (gpt-4o-mini with vision), React, Vite, zod, node-cron, helmet, express-rate-limit, uuid, DOMPurify/sanitize-html

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `data/quizzes.json`
- Create: `data/sync-state.json`
- Create: `data/posters/.gitkeep`

**Step 1: Initialize git repo**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && git init`

**Step 2: Create package.json**

```json
{
  "name": "dqc",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "node --watch server/index.js",
    "dev:client": "cd client && npx vite",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build:client": "cd client && npx vite build",
    "start": "node server/index.js",
    "sync": "node server/sync/run.js"
  }
}
```

**Step 3: Create .env.example**

```
AUTH_TOKEN=your-admin-token-here
OPENAI_API_KEY=sk-your-key-here
WHATSAPP_GROUP_ID=groupid@g.us
CONFIDENCE_THRESHOLD=0.7
SYNC_INTERVAL_MINUTES=30
PORT=3001
```

**Step 4: Create .gitignore**

```
node_modules/
.env
data/posters/*
!data/posters/.gitkeep
auth_info_baileys/
client/dist/
```

**Step 5: Create initial data files**

`data/quizzes.json`:
```json
[]
```

`data/sync-state.json`:
```json
{
  "lastSyncTimestamp": null,
  "processedMessageIds": []
}
```

**Step 6: Install backend dependencies**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && npm install express baileys openai node-cron zod uuid helmet express-rate-limit cors sanitize-html concurrently @hapi/boom pino`

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold project structure with deps and config"
```

---

### Task 2: Zod Schema & Eligibility Utils

**Files:**
- Create: `server/schemas/quiz.js`
- Create: `server/utils/eligibility.js`

**Step 1: Write quiz schema**

`server/schemas/quiz.js`:
```js
import { z } from 'zod';

export const EligibilityCategory = z.enum([
  'U18', 'U23', 'U25', 'U30',
  'Open',
  'DU Only', 'JNU Only', 'University Restricted',
  'UG', 'PG', 'Research',
  'Custom'
]);

export const QuizSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['published', 'draft', 'flagged']),
  confidence: z.number().min(0).max(1),
  name: z.string().min(1),
  description: z.string().default(''),
  date: z.string().nullable().default(null),
  time: z.string().nullable().default(null),
  venue: z.string().nullable().default(null),
  venueMapLink: z.string().url().nullable().default(null),
  eligibility: z.array(z.string()).default([]),
  eligibilityCategories: z.array(EligibilityCategory).default([]),
  hostingOrg: z.string().nullable().default(null),
  quizMasters: z.array(z.string()).default([]),
  poc: z.object({
    name: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    whatsapp: z.string().nullable().default(null),
  }).default({}),
  regLink: z.string().url().nullable().default(null),
  instagramLink: z.string().url().nullable().default(null),
  posterImage: z.string().nullable().default(null),
  sourceMessageId: z.string(),
  sourceTimestamp: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  extractedFields: z.array(z.string()).default([]),
});

export const QuizUpdateSchema = QuizSchema.partial().omit({
  id: true,
  sourceMessageId: true,
  sourceTimestamp: true,
  createdAt: true,
});

export const QuizCreateSchema = QuizSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sourceMessageId: true,
  sourceTimestamp: true,
  confidence: true,
  extractedFields: true,
});
```

**Step 2: Write eligibility normalizer**

`server/utils/eligibility.js`:
```js
const AGE_PATTERN = /[Uu](?:nder\s*)?(\d{2})/;
const OPEN_PATTERNS = [/\bopen\b/i, /\beveryone\b/i, /\ball\b/i, /\banyone\b/i];
const UG_PATTERNS = [/\bug\b/i, /\bundergrad/i, /\bbachelor/i];
const PG_PATTERNS = [/\bpg\b/i, /\bpostgrad/i, /\bmaster/i, /\bmba\b/i];
const RESEARCH_PATTERNS = [/\bresearch/i, /\bph\.?d/i, /\bdoctoral/i];
const DU_PATTERNS = [/\bdu\b/i, /\bdelhi\s*uni/i];
const JNU_PATTERNS = [/\bjnu\b/i, /\bjawaharlal/i];

export function normalizeEligibility(rawEligibility) {
  if (!rawEligibility || rawEligibility.length === 0) return [];

  const categories = new Set();
  const raw = Array.isArray(rawEligibility) ? rawEligibility.join(' ') : rawEligibility;

  const ageMatch = raw.match(AGE_PATTERN);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if ([18, 23, 25, 30].includes(age)) categories.add(`U${age}`);
    else categories.add(`U${age}`);
  }

  if (OPEN_PATTERNS.some(p => p.test(raw))) categories.add('Open');
  if (UG_PATTERNS.some(p => p.test(raw))) categories.add('UG');
  if (PG_PATTERNS.some(p => p.test(raw))) categories.add('PG');
  if (RESEARCH_PATTERNS.some(p => p.test(raw))) categories.add('Research');
  if (DU_PATTERNS.some(p => p.test(raw))) categories.add('DU Only');
  if (JNU_PATTERNS.some(p => p.test(raw))) categories.add('JNU Only');

  if (categories.size === 0) categories.add('Custom');

  return [...categories];
}
```

**Step 3: Commit**

```bash
git add server/schemas/ server/utils/
git commit -m "feat: add quiz zod schema and eligibility normalizer"
```

---

### Task 3: JSON Data Store

**Files:**
- Create: `server/store.js`

**Step 1: Write the store**

`server/store.js`:
```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const QUIZZES_PATH = path.join(DATA_DIR, 'quizzes.json');
const SYNC_STATE_PATH = path.join(DATA_DIR, 'sync-state.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(path.join(DATA_DIR, 'posters'))) {
    mkdirSync(path.join(DATA_DIR, 'posters'), { recursive: true });
  }
  if (!existsSync(QUIZZES_PATH)) writeFileSync(QUIZZES_PATH, '[]');
  if (!existsSync(SYNC_STATE_PATH)) {
    writeFileSync(SYNC_STATE_PATH, JSON.stringify({
      lastSyncTimestamp: null,
      processedMessageIds: []
    }));
  }
}

export function getQuizzes() {
  ensureDataDir();
  return JSON.parse(readFileSync(QUIZZES_PATH, 'utf-8'));
}

export function saveQuizzes(quizzes) {
  ensureDataDir();
  writeFileSync(QUIZZES_PATH, JSON.stringify(quizzes, null, 2));
}

export function getQuizById(id) {
  return getQuizzes().find(q => q.id === id) || null;
}

export function addQuiz(quiz) {
  const quizzes = getQuizzes();
  quizzes.push(quiz);
  saveQuizzes(quizzes);
  return quiz;
}

export function updateQuiz(id, updates) {
  const quizzes = getQuizzes();
  const idx = quizzes.findIndex(q => q.id === id);
  if (idx === -1) return null;
  quizzes[idx] = { ...quizzes[idx], ...updates, updatedAt: new Date().toISOString() };
  saveQuizzes(quizzes);
  return quizzes[idx];
}

export function deleteQuiz(id) {
  const quizzes = getQuizzes();
  const idx = quizzes.findIndex(q => q.id === id);
  if (idx === -1) return false;
  quizzes.splice(idx, 1);
  saveQuizzes(quizzes);
  return true;
}

export function getSyncState() {
  ensureDataDir();
  return JSON.parse(readFileSync(SYNC_STATE_PATH, 'utf-8'));
}

export function saveSyncState(state) {
  ensureDataDir();
  writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2));
}

export function isMessageProcessed(messageId) {
  const state = getSyncState();
  return state.processedMessageIds.includes(messageId);
}

export function markMessageProcessed(messageId) {
  const state = getSyncState();
  state.processedMessageIds.push(messageId);
  state.lastSyncTimestamp = new Date().toISOString();
  saveSyncState(state);
}
```

**Step 2: Commit**

```bash
git add server/store.js
git commit -m "feat: add JSON file-based data store"
```

---

### Task 4: Security Middleware

**Files:**
- Create: `server/middleware/security.js`
- Create: `server/middleware/auth.js`

**Step 1: Write security middleware**

`server/middleware/security.js`:
```js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

export function setupSecurity(app) {
  app.use(helmet());

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later' },
  });
  app.use('/api/', apiLimiter);

  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many admin requests, try again later' },
  });
  app.use('/api/admin/', adminLimiter);
}
```

**Step 2: Write auth middleware**

`server/middleware/auth.js`:
```js
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
```

**Step 3: Commit**

```bash
git add server/middleware/
git commit -m "feat: add security middleware (helmet, rate-limit, cors, auth)"
```

---

### Task 5: Public Quiz API Routes

**Files:**
- Create: `server/routes/quizzes.js`

**Step 1: Write public quiz routes**

`server/routes/quizzes.js`:
```js
import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { getQuizzes, getQuizById, addQuiz, updateQuiz, deleteQuiz } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import { QuizCreateSchema, QuizUpdateSchema } from '../schemas/quiz.js';
import { normalizeEligibility } from '../utils/eligibility.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// --- Public routes ---

router.get('/', (req, res) => {
  let quizzes = getQuizzes().filter(q => q.status === 'published');

  const { eligibility, org, upcoming, search } = req.query;

  if (eligibility) {
    const filters = eligibility.split(',');
    quizzes = quizzes.filter(q =>
      q.eligibilityCategories.some(e => filters.includes(e))
    );
  }

  if (org) {
    const orgLower = org.toLowerCase();
    quizzes = quizzes.filter(q =>
      q.hostingOrg?.toLowerCase().includes(orgLower)
    );
  }

  if (upcoming === 'true') {
    const today = new Date().toISOString().split('T')[0];
    quizzes = quizzes.filter(q => !q.date || q.date >= today);
  }

  if (search) {
    const s = search.toLowerCase();
    quizzes = quizzes.filter(q =>
      q.name.toLowerCase().includes(s) ||
      q.description.toLowerCase().includes(s) ||
      q.hostingOrg?.toLowerCase().includes(s) ||
      q.quizMasters.some(qm => qm.toLowerCase().includes(s))
    );
  }

  // Sort: upcoming first by date, then by createdAt
  quizzes.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  res.json(quizzes);
});

router.get('/:id', (req, res) => {
  const quiz = getQuizById(req.params.id);
  if (!quiz || quiz.status !== 'published') {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  res.json(quiz);
});

// --- Admin routes ---

router.get('/admin/all', requireAuth, (req, res) => {
  const quizzes = getQuizzes();
  res.json(quizzes);
});

router.get('/admin/flagged', requireAuth, (req, res) => {
  const quizzes = getQuizzes().filter(q => q.status === 'flagged');
  res.json(quizzes);
});

router.post('/', requireAuth, (req, res) => {
  const parsed = QuizCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const data = parsed.data;
  data.description = sanitizeHtml(data.description);

  const quiz = {
    ...data,
    id: uuidv4(),
    status: data.status || 'published',
    confidence: 1.0,
    eligibilityCategories: normalizeEligibility(data.eligibility),
    sourceMessageId: `manual-${Date.now()}`,
    sourceTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    extractedFields: [],
  };

  addQuiz(quiz);
  res.status(201).json(quiz);
});

router.patch('/:id', requireAuth, (req, res) => {
  const parsed = QuizUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const updates = parsed.data;
  if (updates.description) {
    updates.description = sanitizeHtml(updates.description);
  }
  if (updates.eligibility) {
    updates.eligibilityCategories = normalizeEligibility(updates.eligibility);
  }

  const quiz = updateQuiz(req.params.id, updates);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json(quiz);
});

router.post('/:id/publish', requireAuth, (req, res) => {
  const quiz = updateQuiz(req.params.id, { status: 'published' });
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json(quiz);
});

router.delete('/:id', requireAuth, (req, res) => {
  const deleted = deleteQuiz(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Quiz not found' });
  res.json({ success: true });
});

export default router;
```

**Step 2: Commit**

```bash
git add server/routes/quizzes.js
git commit -m "feat: add public and admin quiz API routes"
```

---

### Task 6: OpenAI Extraction Service

**Files:**
- Create: `server/sync/extractor.js`

**Step 1: Write the extractor**

`server/sync/extractor.js`:
```js
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { normalizeEligibility } from '../utils/eligibility.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a structured data extractor for quiz event announcements from Delhi quiz clubs.

Extract the following fields from the message and/or poster image. Return ONLY valid JSON, no commentary.

{
  "name": "Quiz name/title",
  "description": "A well-formatted markdown description of the event. Use **bold** for emphasis, bullet points for lists.",
  "date": "YYYY-MM-DD format or null if not found",
  "time": "HH:MM format (24h) or descriptive like '2 PM' or null",
  "venue": "Full venue name and address or null",
  "venueMapLink": "Google Maps link if mentioned, or null",
  "eligibility": ["Array of eligibility criteria as mentioned, e.g. 'Open', 'U23', 'UG', 'DU Only'"],
  "hostingOrg": "Organization hosting the quiz or null",
  "quizMasters": ["Array of quiz master names, empty array if not mentioned"],
  "poc": {
    "name": "Contact person name or null",
    "phone": "Phone number or null",
    "whatsapp": "WhatsApp number or null"
  },
  "regLink": "Registration link or null",
  "instagramLink": "Instagram link or null",
  "confidence": 0.85,
  "extractedFields": ["list", "of", "fields", "that", "were", "actually", "found"]
}

Rules:
- confidence: 0.0-1.0 based on how much information you could extract. Below 0.5 if only name found. Above 0.8 if most fields found.
- extractedFields: only list fields where you found actual data, not nulls.
- eligibility is critical: look for age limits (U23, Under 25), degree (UG, PG), university restrictions (DU Only), or Open/anyone.
- For dates, use the current year (2026) if only month/day mentioned.
- Return ONLY the JSON object, nothing else.`;

export async function extractQuizFromMessage(captionText, imagePath) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const userContent = [];

  if (imagePath) {
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: 'high',
      },
    });
  }

  if (captionText) {
    userContent.push({
      type: 'text',
      text: `WhatsApp message caption:\n\n${captionText}`,
    });
  }

  if (userContent.length === 0) return null;

  messages.push({ role: 'user', content: userContent });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 1000,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const raw = JSON.parse(response.choices[0].message.content);

  return {
    ...raw,
    eligibilityCategories: normalizeEligibility(raw.eligibility),
  };
}
```

**Step 2: Commit**

```bash
git add server/sync/extractor.js
git commit -m "feat: add OpenAI quiz extraction with vision support"
```

---

### Task 7: Deduplication Logic

**Files:**
- Create: `server/sync/dedup.js`

**Step 1: Write dedup module**

`server/sync/dedup.js`:
```js
import { getQuizzes, isMessageProcessed } from '../store.js';

export function isDuplicate(messageId) {
  return isMessageProcessed(messageId);
}

export function findSimilarQuiz(extracted) {
  if (!extracted.name || !extracted.date) return null;

  const quizzes = getQuizzes();
  const nameLower = extracted.name.toLowerCase().trim();

  return quizzes.find(q => {
    const nameMatch = q.name.toLowerCase().trim() === nameLower;
    const dateMatch = q.date === extracted.date;
    const orgMatch = !extracted.hostingOrg || !q.hostingOrg ||
      q.hostingOrg.toLowerCase() === extracted.hostingOrg.toLowerCase();

    return (nameMatch && dateMatch) || (nameMatch && orgMatch && dateMatch);
  }) || null;
}
```

**Step 2: Commit**

```bash
git add server/sync/dedup.js
git commit -m "feat: add deduplication logic for quiz messages"
```

---

### Task 8: WhatsApp Sync Module

**Files:**
- Create: `server/sync/whatsapp.js`
- Create: `server/sync/run.js`

**Step 1: Write WhatsApp sync module**

`server/sync/whatsapp.js`:
```js
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
        // Give some time for messages to arrive, then disconnect
        timeout = setTimeout(() => {
          console.log('Sync window complete, disconnecting');
          sock.end(undefined);
        }, 30000); // 30 second window to receive messages
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        try {
          // Only process messages from target group
          const chatId = msg.key.remoteJid;
          if (chatId !== groupId) continue;

          const messageId = msg.key.id;
          if (isDuplicate(messageId)) continue;

          const contentType = getContentType(msg.message);
          let captionText = null;
          let imagePath = null;

          // Extract text
          if (contentType === 'conversation') {
            captionText = msg.message.conversation;
          } else if (contentType === 'extendedTextMessage') {
            captionText = msg.message.extendedTextMessage?.text;
          } else if (contentType === 'imageMessage') {
            captionText = msg.message.imageMessage?.caption;

            // Download image
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              reuploadRequest: sock.updateMediaMessage,
            });
            const filename = `${uuidv4()}.jpg`;
            imagePath = path.join(POSTERS_DIR, filename);
            writeFileSync(imagePath, buffer);
          }

          if (!captionText && !imagePath) continue;

          // Extract quiz details via OpenAI
          const extracted = await extractQuizFromMessage(captionText, imagePath);
          if (!extracted || !extracted.name) {
            markMessageProcessed(messageId);
            continue;
          }

          // Check for similar existing quiz
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
```

**Step 2: Write standalone sync runner**

`server/sync/run.js`:
```js
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
```

**Step 3: Install dotenv**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && npm install dotenv`

**Step 4: Commit**

```bash
git add server/sync/
git commit -m "feat: add WhatsApp sync via Baileys with OpenAI extraction"
```

---

### Task 9: Express Server Entry Point

**Files:**
- Create: `server/index.js`
- Create: `server/routes/sync.js`

**Step 1: Write sync route**

`server/routes/sync.js`:
```js
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
```

**Step 2: Write Express entry point**

`server/index.js`:
```js
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
app.get('*', (req, res) => {
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
```

**Step 3: Commit**

```bash
git add server/index.js server/routes/sync.js
git commit -m "feat: add Express server with cron sync and static file serving"
```

---

### Task 10: React Frontend Scaffolding

**Files:**
- Create: `client/` (via Vite)

**Step 1: Scaffold React app with Vite**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && npm create vite@latest client -- --template react`

**Step 2: Install client dependencies**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc/client && npm install`

**Step 3: Set up Vite proxy for dev**

Modify `client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/posters': 'http://localhost:3001',
    },
  },
});
```

**Step 4: Create API utility**

`client/src/utils/api.js`:
```js
const BASE = '';

export async function fetchQuizzes(params = {}) {
  const query = new URLSearchParams();
  if (params.eligibility) query.set('eligibility', params.eligibility);
  if (params.org) query.set('org', params.org);
  if (params.upcoming !== undefined) query.set('upcoming', params.upcoming);
  if (params.search) query.set('search', params.search);

  const res = await fetch(`${BASE}/api/quizzes?${query}`);
  if (!res.ok) throw new Error('Failed to fetch quizzes');
  return res.json();
}

export async function fetchQuiz(id) {
  const res = await fetch(`${BASE}/api/quizzes/${id}`);
  if (!res.ok) throw new Error('Quiz not found');
  return res.json();
}

// Admin functions
function authHeaders() {
  const token = localStorage.getItem('dqc_admin_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function fetchAllQuizzes() {
  const res = await fetch(`${BASE}/api/quizzes/admin/all`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function fetchFlaggedQuizzes() {
  const res = await fetch(`${BASE}/api/quizzes/admin/flagged`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function createQuiz(data) {
  const res = await fetch(`${BASE}/api/quizzes`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Create failed');
  return res.json();
}

export async function updateQuiz(id, data) {
  const res = await fetch(`${BASE}/api/quizzes/${id}`, {
    method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export async function publishQuiz(id) {
  const res = await fetch(`${BASE}/api/quizzes/${id}/publish`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Publish failed');
  return res.json();
}

export async function deleteQuiz(id) {
  const res = await fetch(`${BASE}/api/quizzes/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function triggerSync() {
  const res = await fetch(`${BASE}/api/sync/trigger`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Sync trigger failed');
  return res.json();
}
```

**Step 5: Commit**

```bash
git add client/
git commit -m "feat: scaffold React frontend with Vite and API utils"
```

---

### Task 11: Frontend Components — Quiz Card & Grid

> **REQUIRED SUB-SKILL:** Use `@superpowers:frontend-design` for all component styling in this task. The UI must be distinctive, nerdy, and fun — not generic AI slop. The user specifically wants a striking visual identity that appeals to quiz enthusiasts.

**Files:**
- Create: `client/src/components/QuizCard.jsx`
- Create: `client/src/components/QuizGrid.jsx`
- Create: `client/src/components/Filters.jsx`

**Step 1: Build QuizCard component**

A single quiz card showing: poster thumbnail, quiz name, date, hosting org, eligibility tags (color-coded by category). All eligibility tags should be visually prominent.

Color coding for eligibility:
- Age-based (U18/U23/U25/U30): warm orange/amber
- Open: green
- University-restricted (DU Only, etc.): purple
- Degree-level (UG/PG): blue
- Custom: gray

**Step 2: Build Filters component**

Filter bar with:
- Eligibility category multi-select (checkboxes grouped: Age | Open | University | Degree)
- Org text filter
- Search text input
- "Upcoming only" toggle (default on)
- Clear all filters button

**Step 3: Build QuizGrid component**

Responsive card grid that takes quizzes array + filter state. Handles empty state ("No quizzes match your filters").

**Step 4: Commit**

```bash
git add client/src/components/
git commit -m "feat: add QuizCard, QuizGrid, and Filters components"
```

---

### Task 12: Frontend Components — Quiz Detail View

> **REQUIRED SUB-SKILL:** Use `@superpowers:frontend-design` for styling.

**Files:**
- Create: `client/src/components/QuizDetail.jsx`

**Step 1: Build QuizDetail component**

Full detail view for a single quiz. Shows:
- Full poster image
- Quiz name (large)
- Markdown-rendered description (use a simple markdown renderer or dangerouslySetInnerHTML with sanitized HTML)
- Date & time
- Venue with Google Maps link (clickable, opens in new tab)
- Eligibility tags (same color coding as cards)
- Hosting org
- Quiz masters list
- POC with WhatsApp click-to-chat link (`https://wa.me/{number}`)
- Registration link (button)
- Instagram link
- Back button to return to grid

All links open in new tabs. WhatsApp POC creates a `wa.me` link.

**Step 2: Commit**

```bash
git add client/src/components/QuizDetail.jsx
git commit -m "feat: add QuizDetail component with all fields and links"
```

---

### Task 13: Frontend Components — Admin Panel

> **REQUIRED SUB-SKILL:** Use `@superpowers:frontend-design` for styling.

**Files:**
- Create: `client/src/components/AdminPanel.jsx`
- Create: `client/src/components/AdminLogin.jsx`
- Create: `client/src/components/QuizEditor.jsx`

**Step 1: Build AdminLogin component**

Simple token input. Stores token in localStorage. Shows error on invalid token.

**Step 2: Build QuizEditor component**

Inline form for editing a quiz's fields. Pre-filled with current values. Save/cancel buttons. Used for both editing existing quizzes and manually adding new ones.

**Step 3: Build AdminPanel component**

Admin view showing:
- All quizzes (published, flagged, draft) in a table/list
- Flagged quizzes highlighted with a warning indicator
- "Publish" button on flagged quizzes
- "Edit" button opens QuizEditor inline
- "Delete" button with confirmation
- "Add Quiz" button opens empty QuizEditor
- "Trigger Sync" button
- Confidence score displayed for each quiz

**Step 4: Commit**

```bash
git add client/src/components/
git commit -m "feat: add admin panel with login, editor, and quiz management"
```

---

### Task 14: App Shell & Routing

> **REQUIRED SUB-SKILL:** Use `@superpowers:frontend-design` for the overall app layout, header, and navigation styling.

**Files:**
- Modify: `client/src/App.jsx`
- Create: `client/src/App.css`

**Step 1: Build App shell**

Simple hash-based routing (no react-router needed):
- `#/` or default → QuizGrid with Filters
- `#/quiz/:id` → QuizDetail
- `#/admin` → AdminPanel (behind AdminLogin)

Header with:
- DQC logo (use the group logo if available, or a text logo)
- App title
- Navigation: "Quizzes" | "Admin"

**Step 2: Wire up state management**

App.jsx manages:
- Current view/route
- Quiz list (fetched from API)
- Filter state
- Selected quiz for detail view
- Admin auth state

**Step 3: Commit**

```bash
git add client/src/
git commit -m "feat: add app shell with hash routing and state management"
```

---

### Task 15: DQC Logo & Assets

**Files:**
- Create: `client/public/logo.png` (if user provides the group logo)

**Step 1: Ask user for logo**

If the user has the DQC group logo, save it to `client/public/logo.png`. Otherwise, create a text-based logo in the header component.

**Step 2: Commit**

```bash
git add client/public/
git commit -m "chore: add DQC logo asset"
```

---

### Task 16: End-to-End Testing

**Step 1: Test backend API manually**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && node server/index.js`

Test with curl:
```bash
# Create a test quiz
curl -X POST http://localhost:3001/api/quizzes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"name":"Test Quiz","description":"A **test** quiz","eligibility":["Open","U23"],"status":"published"}'

# List quizzes
curl http://localhost:3001/api/quizzes

# Filter by eligibility
curl "http://localhost:3001/api/quizzes?eligibility=Open"

# Get flagged
curl http://localhost:3001/api/quizzes/admin/flagged \
  -H "Authorization: Bearer your-token"
```

**Step 2: Test frontend**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && npm run dev`

Verify:
- Quiz grid loads and displays test quiz
- Filters work (eligibility, search, org)
- Quiz detail view shows all fields with clickable links
- Admin panel: login, edit, delete, add, publish all work
- Mobile responsive

**Step 3: Test WhatsApp sync (requires .env configured)**

Run: `cd /home/kirtan/Desktop/2026_Projects/sides/dqc && npm run sync`

First run will show QR code. Scan with WhatsApp. Subsequent runs use saved auth.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end testing fixes"
```

---

### Task 17: Final Polish

**Step 1: Add README**

Only if user requests it.

**Step 2: Verify .env.example is complete**

Make sure all required env vars are documented.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final polish and cleanup"
```
