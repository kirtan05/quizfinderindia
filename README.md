<div align="center">

# Quiz Finder India

**Never miss a quiz in India again.**

Quiz announcements are scattered across dozens of WhatsApp groups and Instagram pages. Quiz Finder aggregates them all into one clean, searchable feed — powered by AI.

[**Browse Quizzes**](https://quizfinderindia.vercel.app) · [**Report a Group**](https://github.com/kirtan05/quizfinderindia/issues/new?template=report-group.yml) · [**Request a City**](https://github.com/kirtan05/quizfinderindia/issues/new?template=request-city.yml)

[![Live Site](https://img.shields.io/badge/live-quizfinderindia.vercel.app-blue?style=flat-square)](https://quizfinderindia.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## The Problem

Quiz announcements in India are spread across dozens of WhatsApp groups and Instagram pages. With so many sources and so many messages, it's easy to miss quizzes that are perfect for you.

**Quiz Finder fixes this.** We monitor 5 WhatsApp groups and 75+ Instagram pages across India, extract quiz details using AI, and publish everything to a searchable, filterable feed — updated daily.

---

## How It Works

```
WhatsApp Groups ──┐
                   ├──> GPT-4o extracts details ──> Searchable Feed + Push Notifications
Instagram Pages ──┘
```

1. **Collect** — We monitor WhatsApp quiz groups and scrape Instagram pages from quiz clubs, college societies, and organizers across India
2. **Extract** — GPT-4o reads both poster images and text captions, pulling out the quiz name, date, time, venue, eligibility, registration links, and more
3. **Publish** — High-confidence extractions go live automatically. Ambiguous ones are flagged for manual review. Duplicates are caught by fuzzy matching
4. **Notify** — Subscribed users get push notifications filtered by their city and eligibility preferences

No data is collected from users. No login required. Just quizzes.

---

## Features

| Feature | Description |
|---------|-------------|
| **City filtering** | See quizzes in your city — Delhi, Bangalore, Chennai, Mumbai, Hyderabad, Kolkata, and more |
| **Eligibility tags** | Filter by U18, U23, U25, U30, Open, UG, PG, and more |
| **Online / Offline** | Toggle between in-person, online, and hybrid events |
| **Search** | Find quizzes by name, organizer, quiz master, or topic |
| **Google Calendar** | One-click "Add to Calendar" with pre-filled event details |
| **Quick actions** | WhatsApp the organizer, open registration form, or view the Instagram post — right from the card |
| **Push notifications** | Get alerted when new quizzes match your city and eligibility preferences |
| **Poster images** | See the original poster alongside extracted details |
| **Multi-source** | Aggregates from both WhatsApp groups and Instagram pages |

---

## Cities & Coverage

We currently track sources across these cities:

| City | WhatsApp Groups | Instagram Pages | Example Sources |
|------|:-:|:-:|------|
| **Delhi** | 1 | 13 | DQC Official, IIT Delhi QC, SRCC Quiz Soc, DTU Quiz Club |
| **Bangalore** | 2 | 9 | KQA, 4 Edge Quizzing, IIM Bangalore iQ, PES Quotient |
| **Chennai** | 1 | 5 | QFI, IIT Madras QC, SRM Quiz Club, Chennai Quiz Factory |
| **Mumbai** | — | 2 | Bombay Quiz Club, IIT Bombay Literati |
| **Hyderabad** | — | 3 | K-Circle, NALSAR Interrobang, BITS Hyd QC |
| **Kolkata** | — | 2 | IIM Calcutta QC, IISER Kolkata Quizzers |
| **Pune** | — | 2 | COEP Boat Club QC, IISER Pune QC |
| **Online** | 1 | 4 | Quiz Pro Quo, IWTK Quiz, Tata Crucible, Ace of Pubs |
| **25+ other cities** | — | 30+ | IIT/NIT/IIM quiz clubs across India |

**Total: 5 WhatsApp groups + 75+ Instagram pages across 35+ cities**

> Don't see your city or group? [Help us add it!](#report-a-new-group-or-page)

---

## Report a New Group or Page

Quiz Finder grows with community input. If you know a WhatsApp group or Instagram page that announces quizzes, tell us!

### What we need

| Field | Example |
|-------|---------|
| **Platform** | WhatsApp / Instagram |
| **Group or page name** | "Delhi Quiz Club" |
| **City** | Delhi |
| **Instagram username** (if IG) | @delhiquizclub |
| **Invite link** (if WhatsApp) | chat.whatsapp.com/... |

### How to report

Pick whichever is easiest for you:

- **GitHub Issue** (preferred) — [Open a group report](https://github.com/kirtan05/quizfinderindia/issues/new?template=report-group.yml)
- **Google Form** — [Submit here](https://forms.gle/YOUR_FORM_ID) *(coming soon)*
- **WhatsApp** — [Message us](https://wa.me/919XXXXXXXXX)

We review every submission. New Instagram pages are usually added within a day. WhatsApp groups may take longer since they require manual joining.

---

## Push Notifications

Get notified when new quizzes are posted — filtered to what matters to you.

1. Visit [quizfinderindia.vercel.app](https://quizfinderindia.vercel.app)
2. Click the bell icon in the header
3. Select your city and eligibility preferences
4. Allow notifications when your browser asks

You'll receive a push notification whenever a new quiz matches your filters. Works on desktop and mobile (Chrome, Edge, Firefox). You can unsubscribe anytime by clicking the bell icon again.

---

## FAQ

**Is this an official platform by any quiz organization?**
No. Quiz Finder is an independent, open-source project. We aggregate publicly shared announcements — we're not affiliated with any quiz club or organization.

**How often is the data updated?**
We sync daily. WhatsApp messages and Instagram posts from the past 7 days are processed in each sync.

**Are the quiz details always accurate?**
We use AI extraction, which is good but not perfect. Always verify details (especially dates and venues) from the original source. There's a disclaimer on the site for this reason.

**A quiz is missing or has wrong details. What do I do?**
[Open an issue](https://github.com/kirtan05/quizfinderindia/issues/new) with the correct details and we'll fix it.

**Do you collect any personal data?**
No. Push notification subscriptions are anonymous (just a browser endpoint + your chosen filters). No login, no tracking, no analytics beyond Vercel's anonymous page views.

**Can I use this data for my own project?**
The code is MIT-licensed. The quiz data is aggregated from public sources. Please attribute Quiz Finder India if you re-use the dataset.

---

## For Developers

Everything below is for people who want to self-host, contribute code, or understand the architecture.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 7, Service Worker (PWA) |
| **Backend** | Node.js, Express 5 |
| **WhatsApp** | Baileys 7 (WhatsApp Web automation) |
| **Instagram** | Python 3, instaloader |
| **AI Extraction** | OpenAI GPT-4o (vision + text) |
| **Push Notifications** | web-push (VAPID), Vercel KV (Redis) |
| **Validation** | Zod 4 |
| **Deployment** | Vercel (static frontend + serverless) |

### Project Structure

```
quiz-finder/
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx             # Router, layout, city selection
│   │   ├── components/
│   │   │   ├── QuizGrid.jsx    # Filterable quiz feed
│   │   │   ├── QuizCard.jsx    # Individual quiz card
│   │   │   ├── QuizDetail.jsx  # Full quiz details page
│   │   │   ├── Filters.jsx     # City, eligibility, mode filters
│   │   │   └── NotificationBell.jsx  # Push subscription UI
│   │   └── utils/
│   │       └── api.js          # Data fetching (static JSON or API)
│   └── public/
│       └── service-worker.js   # Push notification handler
│
├── server/                     # Express backend (sync + admin)
│   ├── sync/
│   │   ├── run.js              # Sync orchestrator (WhatsApp + IG + notify)
│   │   ├── whatsapp.js         # Baileys client, message fetching
│   │   ├── instagram.js        # Instagram sync (calls Python scraper)
│   │   ├── extractor.js        # GPT-4o extraction prompt + API
│   │   ├── dedup.js            # Source ID tracking + fuzzy matching
│   │   ├── notify.js           # Web-push notification sender
│   │   └── instagram/
│   │       ├── scraper.py      # Python instaloader script
│   │       └── pages.json      # Tracked Instagram pages (75+)
│   ├── schemas/
│   │   └── quiz.js             # Zod quiz validation schema
│   └── store.js                # File-based data layer
│
├── data/
│   ├── quizzes.json            # Quiz database (git-tracked, served statically)
│   ├── city-groups.json        # WhatsApp group config
│   ├── posters/                # Downloaded poster images
│   └── sync-state.json         # Processed message/post IDs
│
├── .env.example                # Environment variable template
├── CONTRIBUTING.md             # Contribution guide
└── LICENSE                     # MIT
```

### Architecture

The frontend is a static site — it reads `data/quizzes.json` directly, no backend required in production. Vercel serves the built React app and the JSON data file.

The backend runs locally on the maintainer's machine for syncing:

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    npm run sync                             │
 │                                                             │
 │  ┌──────────┐   ┌──────────┐   ┌───────────┐               │
 │  │ WhatsApp │   │Instagram │   │           │               │
 │  │ (Baileys)│   │(Python)  │   │  GPT-4o   │               │
 │  │          │   │          │   │ Extractor │               │
 │  └────┬─────┘   └────┬─────┘   └─────┬─────┘               │
 │       │              │               │                      │
 │       ▼              ▼               │                      │
 │   messages +     posts +             │                      │
 │   images         images    ─────────>│                      │
 │                                      ▼                      │
 │                              ┌──────────────┐               │
 │                              │   Dedup +    │               │
 │                              │ Fuzzy Match  │               │
 │                              └──────┬───────┘               │
 │                                     │                       │
 │                                     ▼                       │
 │       ┌──────────────┐    ┌────────────────┐                │
 │       │ Push Notify  │◄───│ quizzes.json   │                │
 │       │ (web-push)   │    │ + posters/     │                │
 │       └──────────────┘    └────────┬───────┘                │
 │                                    │                        │
 │                              git commit + push              │
 │                                    │                        │
 └────────────────────────────────────┼────────────────────────┘
                                      │
                                      ▼
                              Vercel auto-deploys
```

### Self-Hosting / Setup

#### Prerequisites

- Node.js 18+
- Python 3.8+ (for Instagram scraping)
- An OpenAI API key (GPT-4o access)

#### 1. Clone and install

```bash
git clone https://github.com/kirtan05/quizfinderindia.git
cd quizfinderindia
npm install
pip install instaloader
```

#### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Required | Description |
|----------|:--------:|-------------|
| `OPENAI_API_KEY` | Yes | GPT-4o API key for quiz extraction |
| `ADMIN_PASSWORD` | Yes | Password for the admin panel |
| `CONFIDENCE_THRESHOLD` | No | Auto-publish threshold, default `0.7` |
| `INSTAGRAM_USERNAME` | No | Instagram account for higher scrape rate limits |
| `VAPID_PUBLIC_KEY` | No | For push notifications (generate with `npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | No | For push notifications |
| `VAPID_SUBJECT` | No | `mailto:` address for push notifications |
| `VITE_VAPID_PUBLIC_KEY` | No | Same as `VAPID_PUBLIC_KEY`, exposed to client |
| `KV_REST_API_URL` | No | Vercel KV URL for storing push subscriptions |
| `KV_REST_API_TOKEN` | No | Vercel KV token |

#### 3. Configure groups and pages

**WhatsApp groups** — Edit `data/city-groups.json`:

```json
{
  "cities": {
    "YourCity": {
      "groups": [
        { "name": "Group Name", "id": "groupid@g.us" }
      ]
    }
  }
}
```

Run `npm run wa` to discover group IDs from your WhatsApp account.

**Instagram pages** — Edit `server/sync/instagram/pages.json`:

```json
[
  { "username": "pagename", "city": "City", "name": "Display Name" }
]
```

#### 4. Run sync

```bash
# Full sync (WhatsApp + Instagram)
npm run sync

# WhatsApp only
npm run sync:wa

# Instagram only
npm run sync:ig
```

The sync will:
1. Fetch messages/posts from configured sources
2. Extract quiz details using GPT-4o
3. Deduplicate against existing quizzes
4. Save to `data/quizzes.json` and `data/posters/`
5. Git commit and push (triggers Vercel deploy)

#### 5. Development server

```bash
# Full stack (React + Express)
npm run dev

# Frontend only
npm run dev:client

# Backend only
npm run dev:server
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run sync` | Full sync — WhatsApp + Instagram + notifications + git push |
| `npm run sync:wa` | WhatsApp-only sync |
| `npm run sync:ig` | Instagram-only sync |
| `npm run wa` | List WhatsApp groups (for discovering group IDs) |
| `npm run ig` | List configured Instagram pages |
| `npm run dev` | Start dev server (React + Express, hot reload) |
| `npm run dev:client` | Start React dev server only |
| `npm run dev:server` | Start Express dev server only |
| `npm run build:client` | Build React frontend for production |
| `npm start` | Run Express server (production) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, suggesting groups, and submitting code.

The easiest ways to contribute (no coding required):
- **Report a quiz group or Instagram page** we should track
- **Flag incorrect quiz details** so we can fix them
- **Suggest a new city** you want covered

---

## License

[MIT](LICENSE) — Kirtan Jain, 2025-present
