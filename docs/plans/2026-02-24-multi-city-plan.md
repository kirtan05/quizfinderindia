# Multi-City Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform "Delhi Quiz Board" into "Quiz Finder \<City\>" — a multi-city quiz aggregator where cities are config-driven and users pick their city on first visit.

**Architecture:** Add a `city` field to quiz records. A `data/city-groups.json` config maps WhatsApp group IDs to city names. Sync iterates all configured groups, stamps each quiz with its city. Frontend shows a city picker modal on first visit, stores selection in localStorage, scopes all API calls to that city. Header reads "Quiz Finder" + dynamic accent-colored city name.

**Tech Stack:** Express 5, React + Vite, Baileys v7, OpenAI gpt-4o, JSON file store

**Design doc:** `docs/plans/2026-02-24-multi-city-design.md`

---

### Task 1: City Config & Store Helpers

**Files:**
- Create: `data/city-groups.json`
- Modify: `server/store.js`

**Step 1: Create the city-groups config file**

Create `data/city-groups.json`:
```json
{
  "cities": {
    "Delhi": {
      "groups": []
    }
  }
}
```

Empty groups array for now — admin populates group IDs manually.

**Step 2: Add store helpers for city config**

Add to `server/store.js` after the `WA_GROUPS_PATH` section:

```javascript
const CITY_GROUPS_PATH = path.join(DATA_DIR, 'city-groups.json');

export function getCityGroups() {
  ensureDataDir();
  if (!existsSync(CITY_GROUPS_PATH)) {
    writeFileSync(CITY_GROUPS_PATH, JSON.stringify({ cities: {} }, null, 2));
  }
  return JSON.parse(readFileSync(CITY_GROUPS_PATH, 'utf-8'));
}

export function getCityList() {
  const config = getCityGroups();
  return Object.keys(config.cities);
}

export function getGroupCityMap() {
  const config = getCityGroups();
  const map = {};
  for (const [city, { groups }] of Object.entries(config.cities)) {
    for (const gid of groups) {
      map[gid] = city;
    }
  }
  return map;
}
```

**Step 3: Commit**

```bash
git add data/city-groups.json server/store.js
git commit -m "feat: add city-groups config and store helpers"
```

---

### Task 2: Cities API Endpoint

**Files:**
- Modify: `server/routes/quizzes.js`

**Step 1: Add GET /cities endpoint and city query filter**

At the top of `server/routes/quizzes.js`, add `getCityList` to the import from `../store.js`:

```javascript
import { getQuizzes, getQuizById, addQuiz, updateQuiz, deleteQuiz, getCityList } from '../store.js';
```

Add a new route BEFORE the `router.get('/', ...)` handler:

```javascript
router.get('/cities', (req, res) => {
  res.json(getCityList());
});
```

**Step 2: Add city filter to the public GET / endpoint**

In the existing `router.get('/', ...)`, add `city` to the destructured query params:

```javascript
const { eligibility, org, upcoming, search, mode, city } = req.query;
```

Add this filter block right after `let quizzes = getQuizzes().filter(...)`:

```javascript
if (city) {
  quizzes = quizzes.filter(q => q.city === city);
}
```

**Step 3: Commit**

```bash
git add server/routes/quizzes.js
git commit -m "feat: add /cities endpoint and city query filter"
```

---

### Task 3: Migration Script for Existing Quizzes

**Files:**
- Create: `scripts/migrate-city.js`

**Step 1: Write the migration script**

```javascript
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUIZZES_PATH = path.join(__dirname, '..', 'data', 'quizzes.json');

const quizzes = JSON.parse(readFileSync(QUIZZES_PATH, 'utf-8'));
let updated = 0;

for (const q of quizzes) {
  if (!q.city) {
    q.city = 'Delhi';
    updated++;
  }
  if (!q.sourceGroupId) {
    q.sourceGroupId = null;
  }
}

writeFileSync(QUIZZES_PATH, JSON.stringify(quizzes, null, 2));
console.log(`Migrated ${updated} quizzes. All now have city="Delhi".`);
```

**Step 2: Run it**

```bash
node scripts/migrate-city.js
```

Expected: `Migrated 20 quizzes. All now have city="Delhi".`

**Step 3: Commit**

```bash
git add scripts/migrate-city.js data/quizzes.json
git commit -m "feat: migrate existing quizzes with city=Delhi"
```

---

### Task 4: Update Sync Pipeline for Multi-Group

**Files:**
- Modify: `server/sync/whatsapp.js`
- Modify: `server/sync/extractor.js`
- Modify: `server/sync/dedup.js`

**Step 1: Make extractor city-agnostic**

In `server/sync/extractor.js`, change the first line of `SYSTEM_PROMPT` from:

```
You are a structured data extractor for quiz event announcements from Delhi quiz clubs.
```

to:

```
You are a structured data extractor for quiz event announcements.
```

**Step 2: Update dedup to be city-aware**

In `server/sync/dedup.js`, update `findSimilarQuiz` to accept and check city:

```javascript
export function findSimilarQuiz(extracted, city) {
  if (!extracted.name || !extracted.date) return null;

  const quizzes = getQuizzes();
  const nameLower = extracted.name.toLowerCase().trim();

  return quizzes.find(q => {
    if (city && q.city && q.city !== city) return false;
    const nameMatch = q.name.toLowerCase().trim() === nameLower;
    const dateMatch = q.date === extracted.date;
    const orgMatch = !extracted.hostingOrg || !q.hostingOrg ||
      q.hostingOrg.toLowerCase() === extracted.hostingOrg.toLowerCase();

    return (nameMatch && dateMatch) || (nameMatch && orgMatch && dateMatch);
  }) || null;
}
```

**Step 3: Update whatsapp.js for multi-group sync**

Add `getGroupCityMap` to the imports from `../store.js`:

```javascript
import { addQuiz, markMessageProcessed, getSyncState, getWaStatus, saveWaStatus, getGroupCityMap } from '../store.js';
```

In `processMessage`, add `city` parameter and stamp it on the quiz object:

```javascript
async function processMessage(msg, groupId, threshold, sock, city) {
```

After `const similar = findSimilarQuiz(extracted);` change to:

```javascript
const similar = findSimilarQuiz(extracted, city);
```

In the quiz object construction, add after the `mode` line:

```javascript
    city: city || null,
    sourceGroupId: groupId,
```

**Step 4: Rewrite syncWhatsApp for multi-group iteration**

Replace the `syncWhatsApp` function. The key changes:
- Read group-city mapping from config instead of single env var
- Fall back to `WHATSAPP_GROUP_ID` if config has no groups (backward compat)
- Iterate ALL groups, filter messages per-group, pass city to processMessage

```javascript
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
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    const processedInSession = [];
    let connected = false;
    const pendingMessages = [];
    const targetGroupSet = new Set(groupIds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (targetGroupSet.has(msg.key?.remoteJid)) {
          pendingMessages.push(msg);
        }
      }
    });

    sock.ev.on('messaging-history.set', ({ messages }) => {
      const relevant = messages.filter(m => targetGroupSet.has(m.key?.remoteJid));
      if (relevant.length > 0) {
        console.log(`[messaging-history.set] Got ${relevant.length} messages from configured groups`);
        pendingMessages.push(...relevant);
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

        console.log('Waiting 5s for initial history sync...');
        await new Promise(r => setTimeout(r, 5000));

        // Try fetchMessageHistory for each group that has no messages yet
        for (const gid of groupIds) {
          if (pendingMessages.filter(m => m.key?.remoteJid === gid).length === 0) {
            try {
              console.log(`Fetching history for group ${gid}...`);
              await sock.fetchMessageHistory(20, { remoteJid: gid, id: '', fromMe: false }, Math.floor(Date.now() / 1000));
            } catch (err) {
              console.log(`fetchMessageHistory not available for ${gid}: ${err.message}`);
            }
          }
        }

        console.log('Waiting 15s for history responses...');
        await new Promise(r => setTimeout(r, 15000));

        await processPending();
        console.log(`Found ${processedInSession.length} quizzes. Disconnecting...`);
        sock.end(undefined);
      }
    });
  });
}
```

**Step 5: Commit**

```bash
git add server/sync/extractor.js server/sync/dedup.js server/sync/whatsapp.js
git commit -m "feat: multi-group sync with city stamping"
```

---

### Task 5: Frontend — City API + State Management

**Files:**
- Modify: `client/src/utils/api.js`
- Modify: `client/src/App.jsx`

**Step 1: Add fetchCities to api.js**

Add at the top of `client/src/utils/api.js` (after the `BASE` const):

```javascript
export async function fetchCities() {
  const res = await fetch(`${BASE}/api/quizzes/cities`);
  if (!res.ok) throw new Error('Failed to fetch cities');
  return res.json();
}
```

**Step 2: Add city param to fetchQuizzes**

In the existing `fetchQuizzes` function, add after the `if (params.search)` line:

```javascript
if (params.city) query.set('city', params.city);
```

**Step 3: Add city state to App.jsx**

Add `fetchCities` to the import:

```javascript
import { fetchQuizzes, fetchCities } from './utils/api';
```

Add city state inside `App()`, after the disclaimer state:

```javascript
const [cities, setCities] = useState([]);
const [selectedCity, setSelectedCity] = useState(
  () => localStorage.getItem('qfb_city') || ''
);
const [showCityPicker, setShowCityPicker] = useState(false);

useEffect(() => {
  fetchCities().then(list => {
    setCities(list);
    if (list.length === 1) {
      // Auto-select if only one city
      setSelectedCity(list[0]);
      localStorage.setItem('qfb_city', list[0]);
    } else if (!localStorage.getItem('qfb_city')) {
      setShowCityPicker(true);
    }
  }).catch(() => {});
}, []);

function handleCitySelect(city) {
  setSelectedCity(city);
  localStorage.setItem('qfb_city', city);
  setShowCityPicker(false);
}
```

**Step 4: Pass city to quiz fetches**

In the `loadQuizzes` callback, add to the params object:

```javascript
if (selectedCity) params.city = selectedCity;
```

Add `selectedCity` to the useCallback dependency array:

```javascript
}, [filters, selectedCity]);
```

**Step 5: Commit**

```bash
git add client/src/utils/api.js client/src/App.jsx
git commit -m "feat: city state management and API integration"
```

---

### Task 6: Frontend — CityPicker Modal Component

**Files:**
- Create: `client/src/components/CityPicker.jsx`
- Modify: `client/src/App.css`

**Step 1: Create CityPicker component**

```jsx
export default function CityPicker({ cities, onSelect }) {
  return (
    <div className="city-picker-overlay">
      <div className="city-picker">
        <h2 className="city-picker__title">Choose your city</h2>
        <p className="city-picker__subtitle">Find quizzes happening near you</p>
        <div className="city-picker__grid">
          {cities.map(city => (
            <button
              key={city}
              className="city-picker__btn"
              onClick={() => onSelect(city)}
            >
              {city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add CSS for the modal**

Add to `client/src/App.css` before the `/* ---- Header ---- */` section:

```css
/* ---- City Picker Modal ---- */
.city-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
}

.city-picker {
  text-align: center;
  padding: 2.5rem 2rem;
  max-width: 420px;
  width: 90%;
}

.city-picker__title {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.4rem;
}

.city-picker__subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0 0 2rem;
}

.city-picker__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  justify-content: center;
}

.city-picker__btn {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  padding: 0.8rem 1.8rem;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, transform 0.15s;
}

.city-picker__btn:hover {
  border-color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-surface));
  transform: translateY(-2px);
}

.city-picker__btn:active {
  transform: translateY(0);
}
```

**Step 3: Wire CityPicker into App.jsx**

Add the import:

```javascript
import CityPicker from './components/CityPicker';
```

In the JSX return, add the CityPicker right after the disclaimer (before the header):

```jsx
{showCityPicker && cities.length > 1 && (
  <CityPicker cities={cities} onSelect={handleCitySelect} />
)}
```

**Step 4: Commit**

```bash
git add client/src/components/CityPicker.jsx client/src/App.css client/src/App.jsx
git commit -m "feat: city picker modal component"
```

---

### Task 7: Frontend — Dynamic Header Branding

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/App.css`
- Modify: `client/index.html`

**Step 1: Update header JSX in App.jsx**

Replace the existing header brand link:

```jsx
<a href="#/" className="app-header__brand" onClick={() => navigate('/')}>
  <span className="app-header__logo" aria-hidden="true">[?]</span>
  <span className="app-header__title">Delhi Quiz Board</span>
</a>
```

With:

```jsx
<a href="#/" className="app-header__brand" onClick={() => navigate('/')}>
  <span className="app-header__logo" aria-hidden="true">[?]</span>
  <span className="app-header__title">Quiz Finder</span>
  {selectedCity && (
    <button
      className="app-header__city"
      onClick={e => { e.preventDefault(); e.stopPropagation(); setShowCityPicker(true); }}
      title="Change city"
    >
      {selectedCity}
    </button>
  )}
</a>
```

**Step 2: Add CSS for the city button in header**

Add after the existing `.app-header__title` styles:

```css
.app-header__city {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent-orange);
  background: none;
  border: none;
  border-bottom: 2px dashed color-mix(in srgb, var(--accent-orange) 50%, transparent);
  cursor: pointer;
  padding: 0 0.15rem;
  margin-left: 0.4rem;
  transition: border-color 0.2s, color 0.2s;
}

.app-header__city:hover {
  color: var(--accent-lime);
  border-color: var(--accent-lime);
}
```

**Step 3: Update page title**

In `client/index.html`, change:

```html
<title>Delhi Quiz Board</title>
```

to:

```html
<title>Quiz Finder</title>
```

**Step 4: Update server console log**

In `server/index.js`, change:

```javascript
console.log(`DQC server running on http://localhost:${PORT}`);
```

to:

```javascript
console.log(`Quiz Finder server running on http://localhost:${PORT}`);
```

**Step 5: Commit**

```bash
git add client/src/App.jsx client/src/App.css client/index.html server/index.js
git commit -m "feat: dynamic 'Quiz Finder <City>' header branding"
```

---

### Task 8: Build, Test & Final Commit

**Files:**
- Modify: `package.json` (name field)

**Step 1: Update package.json name**

Change `"name": "delhi-quiz-board"` to `"name": "quiz-finder"`.

**Step 2: Build client**

```bash
cd client && npx vite build && cd ..
```

Expected: Build succeeds with no errors.

**Step 3: Verify the full flow**

Start the dev server:
```bash
npm run dev
```

Verify:
- `GET /api/quizzes/cities` returns `["Delhi"]`
- `GET /api/quizzes?city=Delhi` returns only Delhi quizzes
- First visit shows city picker modal (clear localStorage first)
- Selecting Delhi loads quizzes, header shows "Quiz Finder Delhi"
- Clicking "Delhi" in header reopens the picker

**Step 4: Commit**

```bash
git add package.json client/dist
git commit -m "feat: Quiz Finder multi-city support complete"
```
