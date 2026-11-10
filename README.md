<div align="center">

# Quiz Finder India

**Never miss a quiz in India again.**

Quiz announcements are scattered across dozens of WhatsApp groups and Instagram pages. Quiz Finder aggregates them all into one clean, searchable feed — powered by AI.

[**Browse Quizzes**](https://quizfinder.pages.dev) · [**Report a Group**](https://github.com/kirtan05/quizfinderindia/issues/new?template=report-group.yml) · [**Request a City**](https://github.com/kirtan05/quizfinderindia/issues/new?template=request-city.yml)

[![Live Site](https://img.shields.io/badge/live-quizfinder.pages.dev-blue?style=flat-square)](https://quizfinder.pages.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## The Problem

Quiz announcements in India are spread across dozens of WhatsApp groups and Instagram pages. With so many sources and so many messages, it's easy to miss quizzes that are perfect for you.

**Quiz Finder fixes this.** We monitor 11 WhatsApp groups and 75+ Instagram pages across India, extract quiz details using AI, and publish everything to a searchable, filterable feed. WhatsApp announcements show up within about half an hour.

---

## How It Works

```
WhatsApp Groups ──┐
                   ├──> Claude extracts details ──> Searchable Feed + Push Notifications
Instagram Pages ──┘
```

1. **Collect** — We monitor WhatsApp quiz groups and scrape Instagram pages from quiz clubs, college societies, and organizers across India
2. **Extract** — Claude reads both poster images and text captions, pulling out the quiz name, date, time, venue, eligibility, registration links, and more
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
| **Delhi** | 7 | 13 | DQC Official, Bheja Fry QC, Qtopia, IIT Delhi QC, SRCC Quiz Soc, DTU Quiz Club |
| **Bangalore** | 2 | 9 | KQA, 4 Edge Quizzing, IIM Bangalore iQ, PES Quotient |
| **Chennai** | 1 | 5 | QFI, IIT Madras QC, SRM Quiz Club, Chennai Quiz Factory |
| **Mumbai** | — | 2 | Bombay Quiz Club, IIT Bombay Literati |
| **Hyderabad** | — | 3 | K-Circle, NALSAR Interrobang, BITS Hyd QC |
| **Kolkata** | — | 2 | IIM Calcutta QC, IISER Kolkata Quizzers |
| **Pune** | — | 2 | COEP Boat Club QC, IISER Pune QC |
| **Online** | 1 | 4 | Quiz Pro Quo, IWTK Quiz, Tata Crucible, Ace of Pubs |
| **25+ other cities** | — | 30+ | IIT/NIT/IIM quiz clubs across India |

**Total: 11 WhatsApp groups + 75+ Instagram pages across 35+ cities**

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

Push notifications are enabled. The bell in the masthead lets a visitor subscribe with a city and eligibility filter. Subscriptions live in Cloudflare KV, served by Pages Functions (`client/functions/api/subscribe.js`, `notify.js`). After a deploy that includes new quizzes, the watcher POSTs them to `/api/notify`, which pushes to matching subscribers (at most 45 per call, the free plan's 50-subrequest limit; the rest are reported as skipped). If the deploy is skipped or fails, that batch is not notified.

`client/.env.production` holds the public VAPID key (`VITE_VAPID_PUBLIC_KEY`) and `client/wrangler.toml` the bindings (KV namespace, public key). Secrets are set on the Pages project with `npx wrangler pages secret put VAPID_PRIVATE_KEY` and `NOTIFY_SECRET`; put the same `NOTIFY_SECRET` in the root `.env`, and optionally `SITE_URL` to notify a different origin.

---

## FAQ

**Is this an official platform by any quiz organization?**
No. Quiz Finder is an independent, open-source project. We aggregate publicly shared announcements — we're not affiliated with any quiz club or organization.

**How often is the data updated?**
WhatsApp groups are checked every 30 minutes by an unattended watcher. Instagram pages are synced manually, less often.

**Are the quiz details always accurate?**
We use AI extraction, which is good but not perfect. Always verify details (especially dates and venues) from the original source. There's a disclaimer on the site for this reason.

**A quiz is missing or has wrong details. What do I do?**
[Open an issue](https://github.com/kirtan05/quizfinderindia/issues/new) with the correct details and we'll fix it.

**Do you collect any personal data?**
No. Push notification subscriptions are anonymous (just a browser endpoint + your chosen filters). No login, no tracking, no analytics.

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
| **AI Extraction** | Claude (vision + text) via the Claude Code CLI in headless mode |
| **Push Notifications** | Web Push (VAPID), Cloudflare Pages Functions + KV |
| **Validation** | Zod 4 |
| **Deployment** | Cloudflare Pages (static site, uploaded with Wrangler) |

### Project Structure

```
quiz-finder/
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx             # Router, layout, city selection
│   │   ├── components/
│   │   │   ├── QuizCard.jsx    # Individual quiz card
│   │   │   ├── QuizDetail.jsx  # Full quiz details page
│   │   │   ├── Filters.jsx     # City, eligibility, mode filters
│   │   │   ├── Icon.jsx
│   │   │   ├── Link.jsx
│   │   │   ├── NotificationBell.jsx  # Push subscription UI (masthead bell)
│   │   │   ├── AdminLogin.jsx, AdminPanel.jsx, QuizEditor.jsx
│   │   └── utils/
│   │       ├── api.js          # Data fetching (static JSON or API)
│   │       └── quiz.js
│   ├── scripts/
│   │   └── postbuild.mjs       # Per-quiz pages, sitemap, robots.txt, poster thumbnails
│   └── public/
│       ├── _headers            # Cloudflare Pages cache headers
│       └── service-worker.js   # Push notification handler
│
├── server/                     # Express backend (sync + admin)
│   ├── sync/
│   │   ├── run.js              # Sync orchestrator (WhatsApp + IG + notify)
│   │   ├── whatsapp.js         # Baileys client, message fetching
│   │   ├── instagram.js        # Instagram sync (calls Python scraper)
│   │   ├── extractor.js        # Extraction prompt, runs `claude -p`
│   │   ├── watch.js            # Unattended WhatsApp watcher (systemd timer)
│   │   ├── dedup.js            # Source ID tracking + fuzzy matching
│   │   ├── notify.js           # Calls the site's /api/notify after a deploy
│   │   └── instagram/
│   │       ├── scraper.py      # Python instaloader script
│   │       └── pages.json      # Tracked Instagram pages (75+)
│   ├── schemas/
│   │   └── quiz.js             # Zod quiz validation schema
│   └── store.js                # File-based data layer
│
├── data/
│   ├── quizzes.json            # Quiz database (git-tracked, served statically; quizzes may carry `entryFee`: text as announced, "Free", or null)
│   ├── city-groups.json        # WhatsApp group config
│   ├── posters/                # Downloaded poster images (git-ignored: only on the maintainer's machine and the deployed site)
│   └── sync-state.json         # Processed message/post IDs
│
├── .env.example                # Environment variable template
├── CONTRIBUTING.md             # Contribution guide
└── LICENSE                     # MIT
```

### Architecture

The frontend is a static site — it reads `data/quizzes.json` directly, no backend required in production. Cloudflare Pages serves the built React app, the JSON data file and the posters.

`npm run build` in `client/` runs Vite and then `scripts/postbuild.mjs`, which writes one `quiz/<id>/index.html` per published quiz (same app, but with that quiz's title, summary and poster in the Open Graph tags, so a shared link gets its own preview), `sitemap.xml`, `robots.txt`, calendar feeds, and 480px poster thumbnails under `posters/thumbs/` (needs the ImageMagick `magick` command; skipped with a warning if it is missing). It also splits the data: `data/quizzes.json` in the build holds only upcoming published quizzes (dated from yesterday on; undated ones posted in the last 14 days) and `data/past.json` the rest, which the client loads on demand. Flagged quizzes are in neither. The watcher then uploads `client/dist` with `wrangler pages deploy`. There is no build on Cloudflare's side.

**Calendar feeds.** `https://quizfinder.pages.dev/cal/all.ics` lists every upcoming dated quiz, and `/cal/<city>.ics` (city lower-cased, non-alphanumerics replaced by `-`, e.g. `/cal/delhi.ics`) lists that city's quizzes plus the online ones (`Online` city or online mode). Subscribe to them from any calendar app. Quizzes with a clock time are 2-hour events in IST; others are all-day.

**Posters** are no longer committed to git (`data/posters/` is ignored). They live only on the maintainer's machine and in the deployed site, so the sync commits just `data/quizzes.json`.

**Old Vercel site.** The Vercel URL now temporarily (307) redirects every path to the same path on `quizfinder.pages.dev`.

The backend runs locally on the maintainer's machine for syncing:

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    npm run sync                             │
 │                                                             │
 │  ┌──────────┐   ┌──────────┐   ┌───────────┐               │
 │  │ WhatsApp │   │Instagram │   │           │               │
 │  │ (Baileys)│   │(Python)  │   │  Claude   │               │
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
                  client build + wrangler pages deploy
                         (Cloudflare Pages)
```

### Self-Hosting / Setup

#### Prerequisites

- Node.js 18+
- Python 3.8+ (for Instagram scraping)
- [Claude Code](https://claude.com/claude-code) installed and logged in (extraction runs `claude -p`, no API key)
- ImageMagick (`magick`) for poster thumbnails
- A Cloudflare account with a Pages project (to publish the site)

#### 1. Clone and install

```bash
git clone https://github.com/kirtan05/quizfinderindia.git
cd quizfinderindia
npm install
(cd client && npm install)
pip install instaloader
```

To publish your own copy, log in to Cloudflare and create a direct-upload Pages project once. The project name (`quizfinder`) is set in `server/sync/watch.js` and the site URL in `client/scripts/postbuild.mjs` and `client/index.html`; change them to yours.

```bash
cd client
npx wrangler login
npx wrangler pages project create quizfinder --production-branch master
```

#### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Required | Description |
|----------|:--------:|-------------|
| `EXTRACT_MODEL` | No | Claude model alias for extraction, default `sonnet` |
| `ADMIN_PASSWORD` | Yes | Password for the admin panel |
| `CONFIDENCE_THRESHOLD` | No | Auto-publish threshold, default `0.7` |
| `INSTAGRAM_USERNAME` | No | Instagram account for higher scrape rate limits |
| `NOTIFY_SECRET` | For push | Shared secret for `/api/notify` (also set on the Pages project) |
| `SITE_URL` | No | Site origin to notify, default `https://quizfinder.pages.dev` |

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
2. Extract quiz details using Claude
3. Deduplicate against existing quizzes
4. Save to `data/quizzes.json` and `data/posters/`
5. Git commit and push `data/quizzes.json` (posters are not committed). This does not update the live site; run `npm run deploy` for that

#### 4b. Unattended WhatsApp watcher

`npm run sync` opens its own WhatsApp session and needs someone at the terminal. `npm run watch` does not: it reads new messages from the local store of an always-connected `wa` CLI daemon (`~/.local/share/wa/store/wa.db`), extracts quizzes, commits and pushes, then builds the client and deploys it to Cloudflare Pages. It deploys only when there is new data (or when the previous deploy failed).

```bash
npm run watch -- --dry-run --days 3   # print what it would add, write nothing
npm run watch -- --no-push            # update data files, skip git and the deploy
npm run deploy                        # a watcher run that builds and deploys even with no new quizzes
cp deploy/quizfinder-watch.{service,timer} ~/.config/systemd/user/
systemctl --user enable --now quizfinder-watch.timer   # every 30 minutes
journalctl --user -u quizfinder-watch                   # logs
```

Groups marked `"discussion": true` in `data/city-groups.json` are chat groups rather than announcement groups: only long messages that look like announcements are sent for extraction. If a run fails, the watcher WhatsApps the linked account (at most once every 6 hours).

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
| `npm run sync` | Full sync — WhatsApp + Instagram + notifications + git push (no deploy; run `npm run deploy`) |
| `npm run sync:wa` | WhatsApp-only sync |
| `npm run sync:ig` | Instagram-only sync |
| `npm run wa` | List WhatsApp groups (for discovering group IDs) |
| `npm run ig` | List configured Instagram pages |
| `npm run dev` | Start dev server (React + Express, hot reload) |
| `npm run dev:client` | Start React dev server only |
| `npm run dev:server` | Start Express dev server only |
| `npm run watch` | Unattended watcher run — extract, git push, deploy to Cloudflare Pages |
| `npm run deploy` | Same as `watch`, but always builds and deploys |
| `npm run build:client` | Build the static site into `client/dist` |
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
