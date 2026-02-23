# DQC Quiz Aggregator — Design Document

**Date:** 2026-02-22
**Status:** Approved

## Problem

Delhi Quiz Club (DQC) WhatsApp group has quiz announcements from many orgs/colleges across Delhi. It's hard to track what's happening, filter by eligibility, or find details without scrolling through chat noise.

## Solution

A local web app that syncs quiz announcements from the DQC WhatsApp group, extracts structured details using OpenAI vision, and displays them on a filterable card grid.

## Architecture

Monorepo with Express backend + React (Vite) frontend. JSON file storage. Baileys for WhatsApp integration. OpenAI gpt-4o-mini for structured extraction from poster images and captions.

## Tech Stack

- **Backend:** Node.js, Express, Baileys (WhatsApp), OpenAI API, node-cron, zod
- **Frontend:** React (Vite)
- **Storage:** JSON files (quizzes.json, sync-state.json)
- **Security:** helmet, express-rate-limit, CORS, input sanitization

## Data Model

```json
{
  "id": "uuid",
  "status": "published | draft | flagged",
  "confidence": 0.85,
  "name": "Quiz Name",
  "description": "Markdown formatted description",
  "date": "2026-03-15",
  "time": "14:00",
  "venue": "St. Stephen's College, Delhi",
  "venueMapLink": "https://maps.google.com/...",
  "eligibility": ["Open"],
  "hostingOrg": "DQC",
  "quizMasters": ["QM Name 1", "QM Name 2"],
  "poc": { "name": "Contact", "phone": null, "whatsapp": "91XXXXXXXXXX" },
  "regLink": "https://...",
  "instagramLink": "https://instagram.com/...",
  "posterImage": "posters/uuid.jpg",
  "sourceMessageId": "whatsapp-msg-id",
  "sourceTimestamp": "2026-02-22T10:00:00Z",
  "createdAt": "2026-02-22T10:05:00Z",
  "updatedAt": "2026-02-22T10:05:00Z",
  "extractedFields": ["name", "date", "venue", "eligibility"]
}
```

## Eligibility Categories

Normalized into filterable groups:
- **Age-based:** U18, U23, U25, U30
- **Open:** Anyone can participate
- **University-restricted:** DU Only, JNU Only, etc.
- **Degree-level:** UG, PG, Research
- **Custom:** Anything else, stored as-is

## Sync Pipeline

1. Cron triggers every 30 minutes
2. Baileys connects, fetches new messages since last sync
3. Dedup by sourceMessageId, skip already-processed
4. For each message: extract caption + download poster image
5. Send to OpenAI gpt-4o-mini (vision) with structured extraction prompt
6. Confidence >= 0.7 → published; < 0.7 → flagged
7. Secondary dedup: same name + date + org = potential duplicate, flag
8. Save to quizzes.json, poster to data/posters/

## API

**Public:**
- `GET /api/quizzes` — list published, filterable by eligibility, org, date, search
- `GET /api/quizzes/:id` — single quiz

**Admin (token auth):**
- `POST /api/quizzes` — manual add
- `PATCH /api/quizzes/:id` — edit
- `DELETE /api/quizzes/:id` — remove
- `GET /api/quizzes/flagged` — flagged for review
- `POST /api/quizzes/:id/publish` — promote flagged to published
- `POST /api/sync/trigger` — manual sync

## Frontend

- Card grid with filters (eligibility category, org, date range, search)
- Quiz detail view with all fields and clickable links
- Admin panel for editing, reviewing flagged, manual add, sync trigger
- Distinctive nerdy UI personality (not generic AI slop)
- Mobile responsive

## Security

- Rate limiting (express-rate-limit)
- Security headers (helmet)
- CORS restricted to frontend origin
- Input sanitization on all admin endpoints
- Zod schema validation on all inputs
- Markdown sanitization before rendering
- Poster upload validation (file type, size)
- Bearer token auth for admin routes

## Project Structure

```
dqc/
├── server/
│   ├── index.js
│   ├── routes/ (quizzes.js, sync.js)
│   ├── sync/ (whatsapp.js, extractor.js, dedup.js)
│   ├── middleware/ (auth.js, security.js)
│   └── utils/ (eligibility.js)
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/ (QuizGrid, QuizCard, QuizDetail, Filters, AdminPanel)
│   │   └── utils/ (api.js)
│   └── index.html
├── data/ (quizzes.json, sync-state.json, posters/)
├── .env
└── package.json
```
