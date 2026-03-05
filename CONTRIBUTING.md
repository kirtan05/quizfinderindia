# Contributing to Quiz Finder India

Thanks for your interest in contributing! Quiz Finder grows with community help — whether that's reporting new groups, fixing bugs, or adding features.

## Non-Code Contributions

These are the highest-impact contributions and require no technical knowledge:

### Report a quiz group or Instagram page

Know a WhatsApp group or Instagram page that posts quiz announcements? Tell us!

**What we need:**
- Platform (WhatsApp or Instagram)
- Group/page name
- City
- Instagram username or WhatsApp invite link

**How to report:**
- [Open a GitHub issue](https://github.com/kirtan05/quizfinderindia/issues/new?template=report-group.yml)

### Flag incorrect quiz details

If a quiz listing has wrong details (wrong date, venue, etc.), [open an issue](https://github.com/kirtan05/quizfinderindia/issues/new) with:
- The quiz name
- What's wrong
- The correct information (if you know it)

### Request a new city

Want your city covered? [Open an issue](https://github.com/kirtan05/quizfinderindia/issues/new?template=request-city.yml) and tell us which WhatsApp groups or Instagram pages to track there.

---

## Code Contributions

### Setup

```bash
git clone https://github.com/kirtan05/quizfinderindia.git
cd quizfinderindia
npm install
cp .env.example .env
# Fill in your .env (at minimum: OPENAI_API_KEY, ADMIN_PASSWORD)
```

See the [README](README.md#self-hosting--setup) for full setup instructions.

### Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test locally with `npm run dev`
5. Commit with a descriptive message
6. Push to your fork and open a PR

### Commit Messages

Follow this format:

```
type: short description

Longer explanation if needed.
```

Types: `feat`, `fix`, `docs`, `refactor`, `data`, `chore`

Examples:
- `feat: add Pune city support`
- `fix: handle missing poster image gracefully`
- `docs: update coverage table in README`
- `data: sync 2026-03-04 — 10 new quizzes (whatsapp)`

### Code Style

- No linter configured yet — just be consistent with existing code
- ES modules (`import/export`), not CommonJS
- Prefer simple, readable code over clever abstractions

### Areas Where Help Is Welcome

- **Frontend polish** — UI improvements, responsive design fixes, accessibility
- **New source integrations** — Unstop scraper, email newsletter parsing
- **Testing** — Unit tests for extraction, dedup, and fuzzy matching
- **Performance** — Optimizing the sync pipeline for large numbers of sources
- **Documentation** — Improving setup guides, adding screenshots

---

## Questions?

Open an issue on [GitHub](https://github.com/kirtan05/quizfinderindia/issues).
