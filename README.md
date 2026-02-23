# Delhi Quiz Board

> A real-time quiz event aggregator for the Delhi quizzing scene. Automatically extracts quiz announcements from a WhatsApp group, parses event details using GPT-4o vision, and serves them through a fast, filterable web interface.

```
  ___________
 |  _______  |     Delhi Quiz Board
 | | QUIZ! | |     ==================
 | |_______| |     Never miss a quiz again.
 |   __ __   |     WhatsApp -> GPT-4o -> Web
 |  |__|__|  |
 |___________|
```

---

## How It Works

```
WhatsApp Group          Server                    Frontend
  (DQC Official)  -->  Baileys WA API   -->    React + Vite
                       |                        |
                       v                        v
                    GPT-4o Vision         Filterable grid
                    (extracts quiz        with action buttons
                     details from         (Register, WhatsApp,
                     text + posters)       Instagram)
                       |
                       v
                    JSON data store
                    (quizzes.json)
```

1. **Connect** your WhatsApp account via QR scan in the admin panel
2. **Select** the target WhatsApp group (e.g., Delhi Quiz Club)
3. **Sync** triggers message fetch -- text messages and poster images go through GPT-4o
4. **Extracted** quiz details (name, date, venue, eligibility, POC, links) are stored and published
5. **Users** browse quizzes with filters for eligibility, mode (online/offline), org, and search

---

## Features

- **Automated extraction** -- GPT-4o vision reads both text captions and poster images
- **Smart eligibility parsing** -- Normalizes "Under 23", "UG", "Open to all DU students" into filterable categories
- **Online/Offline/Hybrid filter** -- Quick toggle between event modes
- **Action buttons on cards** -- WhatsApp, Register, Instagram links right on the card (no detail page needed)
- **Admin panel** -- QR login, group selection, sync trigger, quiz editor, publish/flag workflow
- **Deduplication** -- Fuzzy matching prevents duplicate quiz entries
- **Confidence scoring** -- Low-confidence extractions get flagged for manual review

---

## Quick Start

### Prerequisites

- Node.js 20+
- An OpenAI API key (with GPT-4o access)
- A WhatsApp account for the bot session

### Setup

```bash
# Clone
git clone https://github.com/kirtan05/delhiquizboard.git
cd delhiquizboard

# Install dependencies
npm install
cd client && npm install && cd ..

# Configure
cp .env.example .env
# Edit .env with your OpenAI key and admin token
```

### Development

```bash
npm run dev
# Starts both server (port 3001) and client (port 5173)
```

### Production

```bash
npm run build:client
npm start
# Server runs on PORT (default 3001), serves API
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `AUTH_TOKEN` | Admin panel auth token | Yes |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o) | Yes |
| `WHATSAPP_GROUP_ID` | Target WhatsApp group JID | Set via admin panel |
| `CONFIDENCE_THRESHOLD` | Min confidence to auto-publish (0-1) | No (default: 0.7) |
| `SYNC_INTERVAL_MINUTES` | Auto-sync interval | No (default: 30) |
| `PORT` | Server port | No (default: 3001) |
| `CORS_ORIGIN` | Allowed CORS origin | No (default: localhost:5173) |

---

## Project Structure

```
.
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/      # QuizCard, QuizGrid, QuizDetail, Filters, AdminPanel
│       ├── utils/           # API client, tag colors
│       └── App.jsx          # Hash router, filter state
├── server/
│   ├── routes/              # Express routes (quizzes, sync)
│   ├── sync/
│   │   ├── whatsapp.js      # Baileys WA client, message fetch
│   │   ├── extractor.js     # GPT-4o extraction prompt
│   │   └── dedup.js         # Fuzzy deduplication
│   ├── utils/
│   │   └── eligibility.js   # Eligibility normalizer
│   ├── middleware/           # Auth middleware
│   ├── schemas/             # Zod validation schemas
│   └── store.js             # JSON file data store
├── data/
│   ├── quizzes.json         # Quiz database
│   └── posters/             # Downloaded poster images
└── scripts/                 # Utility scripts
```

---

## API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/quizzes` | List published quizzes (supports `?search`, `?org`, `?eligibility`, `?mode`, `?upcoming`) |
| `GET` | `/api/quizzes/:id` | Get single quiz |

### Admin (requires `Authorization: Bearer <token>`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/quizzes/admin/all` | All quizzes (including flagged) |
| `POST` | `/api/quizzes` | Create quiz manually |
| `PATCH` | `/api/quizzes/:id` | Update quiz fields |
| `POST` | `/api/quizzes/:id/publish` | Publish a flagged quiz |
| `DELETE` | `/api/quizzes/:id` | Delete quiz |
| `POST` | `/api/sync/trigger` | Trigger WhatsApp sync |
| `GET` | `/api/sync/status` | WhatsApp connection status |
| `GET` | `/api/sync/connect` | SSE endpoint for QR + status |
| `POST` | `/api/sync/reconnect` | Clear auth, require new QR |
| `POST` | `/api/sync/set-group` | Set target WhatsApp group |
| `GET` | `/api/sync/groups` | List cached WhatsApp groups |

---

## Extracted Fields

Each quiz is extracted with:

| Field | Example |
|---|---|
| `name` | "QUIZFEST'26" |
| `date` | "2026-02-23" |
| `time` | "12:30" |
| `venue` | "ARSD College" |
| `mode` | "offline" / "online" / "hybrid" |
| `eligibility` | ["U23", "UG"] |
| `teamSize` | 2 |
| `crossCollege` | true |
| `hostingOrg` | "MindMasters" |
| `quizMasters` | ["Yuvraj", "Pavani"] |
| `poc` | { name, phone, whatsapp } |
| `regLink` | "https://forms.gle/..." |
| `instagramLink` | "https://instagram.com/..." |
| `confidence` | 0.95 |

---

## Tech Stack

- **Frontend**: React 19, Vite 7, CSS custom properties
- **Backend**: Express 5, Node.js
- **WhatsApp**: Baileys v7 (multi-device)
- **AI**: OpenAI GPT-4o (vision + text)
- **Data**: JSON file store (no database needed)

---

## License

MIT
