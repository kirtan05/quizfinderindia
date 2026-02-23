# Eligibility Filtering + Card Action Links — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve eligibility extraction to separate team-size/cross-college from actual eligibility, and add action links (WhatsApp, Register, Instagram) directly on quiz cards.

**Architecture:** Update the LLM extraction prompt to return `teamSize` and `crossCollege` as separate fields; update the normalizer to strip noise from eligibility; add an action bar to QuizCard; show team info in QuizDetail.

**Tech Stack:** Node.js (server), React (client), OpenAI gpt-4o, CSS custom properties.

---

### Task 1: Update extraction prompt

**Files:**
- Modify: `server/sync/extractor.js`

**Step 1: Update SYSTEM_PROMPT JSON schema**

Add `teamSize`, `crossCollege` fields to the JSON schema in the prompt. Update eligibility instructions. Update POC instructions.

Replace the current `SYSTEM_PROMPT` string (lines 7-37) with:

```js
const SYSTEM_PROMPT = `You are a structured data extractor for quiz event announcements from Delhi quiz clubs.

Extract the following fields from the message and/or poster image. Return ONLY valid JSON, no commentary.

{
  "name": "Quiz name/title",
  "description": "A well-formatted markdown description of the event. Use **bold** for emphasis, bullet points for lists.",
  "date": "YYYY-MM-DD format or null if not found",
  "time": "HH:MM format (24h) or descriptive like '2 PM' or null",
  "venue": "Full venue name and address or null",
  "venueMapLink": "Google Maps link if mentioned, or null",
  "eligibility": ["Array of ONLY age/degree/university restrictions, e.g. 'Open', 'U23', 'UG', 'DU Only'. Do NOT include team size or cross-college info here."],
  "teamSize": "Maximum team size as a number (1 for solo-only, 2 for pairs, 3 for trios). null if not mentioned.",
  "crossCollege": "true if cross-college/cross-institution teams are explicitly allowed, false if restricted to one college, null if not mentioned",
  "hostingOrg": "Organization hosting the quiz or null",
  "quizMasters": ["Array of quiz master names, empty array if not mentioned"],
  "poc": {
    "name": "Contact person name or null",
    "phone": "Phone number or null",
    "whatsapp": "WhatsApp number if separately mentioned. If only one phone number is found and no separate WhatsApp is listed, set whatsapp to that same phone number."
  },
  "regLink": "Registration link or null",
  "instagramLink": "Instagram link or null",
  "confidence": 0.85,
  "extractedFields": ["list", "of", "fields", "that", "were", "actually", "found"]
}

Rules:
- confidence: 0.0-1.0 based on how much information you could extract. Below 0.5 if only name found. Above 0.8 if most fields found.
- extractedFields: only list fields where you found actual data, not nulls.
- eligibility: ONLY age limits (U23, Under 25), degree levels (UG, PG), or university restrictions (DU Only, Open). Never put team size or cross-college info in this array.
- teamSize: Extract from phrases like "team of 2", "lone wolf", "solo", "teams of 3", "1 to 3 members". Return the maximum allowed team size as a number.
- crossCollege: Look for "cross-college", "inter-college", "cross institution", "open to all colleges".
- For dates, use the current year (2026) if only month/day mentioned.
- Return ONLY the JSON object, nothing else.`;
```

**Step 2: Update the return value in extractQuizFromMessage**

After line 90 (`...raw,`), add `teamSize` and `crossCollege` passthrough:

```js
  return {
    ...raw,
    eligibilityCategories: normalizeEligibility(raw.eligibility),
  };
```

No change needed — `...raw` already spreads `teamSize` and `crossCollege` through.

**Step 3: Commit**

```
git add server/sync/extractor.js
git commit -m "feat: update extraction prompt with teamSize, crossCollege, and better POC"
```

---

### Task 2: Update eligibility normalizer

**Files:**
- Modify: `server/utils/eligibility.js`

**Step 1: Update normalizeEligibility**

Replace the entire file with:

```js
const AGE_PATTERN = /[Uu](?:nder\s*)?(\d{2})/;
const OPEN_PATTERNS = [/\bopen\b/i, /\beveryone\b/i, /\ball\b/i, /\banyone\b/i];
const UG_PATTERNS = [/\bug\b/i, /\bundergrad/i, /\bbachelor/i];
const PG_PATTERNS = [/\bpg\b/i, /\bpostgrad/i, /\bmaster/i, /\bmba\b/i];
const RESEARCH_PATTERNS = [/\bresearch/i, /\bph\.?d/i, /\bdoctoral/i];
const DU_PATTERNS = [/\bdu\b/i, /\bdelhi\s*uni/i];

// Patterns to STRIP before normalizing (team size, cross-college)
const NOISE_PATTERNS = [
  /\bteams?\s*(of\s*)?\d+\b/i,
  /\blone\s*wolves?\b/i,
  /\blone\s*wolf\b/i,
  /\bsolo\b/i,
  /\bcross[\s-]*college\b/i,
  /\bcross[\s-]*institution\b/i,
  /\binter[\s-]*college\b/i,
];

export function normalizeEligibility(rawEligibility) {
  if (!rawEligibility || rawEligibility.length === 0) return [];

  const categories = new Set();
  let raw = Array.isArray(rawEligibility) ? rawEligibility.join(' ') : rawEligibility;

  // Strip noise before normalizing
  for (const pattern of NOISE_PATTERNS) {
    raw = raw.replace(pattern, '');
  }

  const ageMatch = raw.match(AGE_PATTERN);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    categories.add(`U${age}`);
  }

  if (OPEN_PATTERNS.some(p => p.test(raw))) categories.add('Open');
  if (UG_PATTERNS.some(p => p.test(raw))) categories.add('UG');
  if (PG_PATTERNS.some(p => p.test(raw))) categories.add('PG');
  if (RESEARCH_PATTERNS.some(p => p.test(raw))) categories.add('Research');
  if (DU_PATTERNS.some(p => p.test(raw))) categories.add('DU Only');

  if (categories.size === 0) categories.add('Custom');

  return [...categories];
}
```

**Step 2: Commit**

```
git add server/utils/eligibility.js
git commit -m "feat: strip team-size and cross-college noise from eligibility normalizer"
```

---

### Task 3: Update whatsapp.js to pass through new fields

**Files:**
- Modify: `server/sync/whatsapp.js`

**Step 1: Add teamSize and crossCollege to the quiz object**

In the `processMessage` function, after line 93 (`posterImage`) and before `sourceMessageId`, add:

```js
    teamSize: extracted.teamSize ?? null,
    crossCollege: extracted.crossCollege ?? null,
```

**Step 2: Commit**

```
git add server/sync/whatsapp.js
git commit -m "feat: pass teamSize and crossCollege through sync pipeline"
```

---

### Task 4: Add action bar to QuizCard

**Files:**
- Modify: `client/src/components/QuizCard.jsx`
- Modify: `client/src/App.css`

**Step 1: Update QuizCard.jsx**

Replace the entire file content with:

```jsx
import { getTagColor } from '../utils/tagColors';

function formatDate(dateStr) {
  if (!dateStr) return 'TBA';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function waLink(number) {
  const clean = (number || '').replace(/[^0-9]/g, '');
  return `https://wa.me/${clean}`;
}

export default function QuizCard({ quiz, onClick }) {
  const tags = (quiz.eligibility || []).filter(Boolean);
  const pocNumber = quiz.poc?.whatsapp || quiz.poc?.phone;

  return (
    <article className="quiz-card" onClick={() => onClick(quiz.id)} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick(quiz.id); }}
      role="button"
      aria-label={`View details for ${quiz.name}`}
    >
      <div className="quiz-card__poster">
        {quiz.posterImage ? (
          <img src={`/${quiz.posterImage}`} alt={`${quiz.name} poster`} loading="lazy" />
        ) : (
          <div className="quiz-card__placeholder">
            <span className="quiz-card__placeholder-icon">?!</span>
            <span className="quiz-card__placeholder-text">No poster yet</span>
          </div>
        )}
      </div>

      <div className="quiz-card__body">
        <h3 className="quiz-card__title">{quiz.name || 'Untitled Quiz'}</h3>

        <div className="quiz-card__meta">
          <span className="quiz-card__date">
            <span className="quiz-card__icon" aria-hidden="true">&gt;</span>
            {formatDate(quiz.date)}
          </span>
          {quiz.hostingOrg && (
            <span className="quiz-card__org">
              <span className="quiz-card__icon" aria-hidden="true">@</span>
              {quiz.hostingOrg}
            </span>
          )}
        </div>

        {quiz.venue && (
          <p className="quiz-card__venue">
            <span className="quiz-card__icon" aria-hidden="true">#</span>
            {quiz.venue}
          </p>
        )}

        {tags.length > 0 && (
          <div className="quiz-card__tags">
            {tags.map((tag, i) => (
              <span key={i} className="tag" style={{ '--tag-color': getTagColor(tag) }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {(pocNumber || quiz.regLink || quiz.instagramLink) && (
        <div className="quiz-card__actions">
          {pocNumber && (
            <a href={waLink(pocNumber)} target="_blank" rel="noopener noreferrer"
              className="quiz-card__action quiz-card__action--wa"
              onClick={e => e.stopPropagation()} title="WhatsApp">
              WhatsApp
            </a>
          )}
          {quiz.regLink && (
            <a href={quiz.regLink} target="_blank" rel="noopener noreferrer"
              className="quiz-card__action quiz-card__action--reg"
              onClick={e => e.stopPropagation()} title="Register">
              Register
            </a>
          )}
          {quiz.instagramLink && (
            <a href={quiz.instagramLink} target="_blank" rel="noopener noreferrer"
              className="quiz-card__action quiz-card__action--ig"
              onClick={e => e.stopPropagation()} title="Instagram">
              Insta
            </a>
          )}
        </div>
      )}

      <div className="quiz-card__edge" aria-hidden="true" />
    </article>
  );
}
```

**Step 2: Add CSS for the action bar**

Append after `.quiz-card__tags` rules (after line 529 in App.css):

```css
.quiz-card__actions {
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem 0.7rem;
  border-top: 1px solid var(--border-subtle);
}

.quiz-card__action {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-sm);
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.quiz-card__action--wa {
  background: color-mix(in srgb, #25d366 18%, transparent);
  color: #25d366;
  border: 1px solid color-mix(in srgb, #25d366 35%, transparent);
}

.quiz-card__action--wa:hover {
  background: color-mix(in srgb, #25d366 30%, transparent);
}

.quiz-card__action--reg {
  background: color-mix(in srgb, var(--accent-orange) 18%, transparent);
  color: var(--accent-orange);
  border: 1px solid color-mix(in srgb, var(--accent-orange) 35%, transparent);
}

.quiz-card__action--reg:hover {
  background: color-mix(in srgb, var(--accent-orange) 30%, transparent);
}

.quiz-card__action--ig {
  background: color-mix(in srgb, var(--accent-purple) 18%, transparent);
  color: var(--accent-purple);
  border: 1px solid color-mix(in srgb, var(--accent-purple) 35%, transparent);
}

.quiz-card__action--ig:hover {
  background: color-mix(in srgb, var(--accent-purple) 30%, transparent);
}
```

**Step 3: Commit**

```
git add client/src/components/QuizCard.jsx client/src/App.css
git commit -m "feat: add WhatsApp, Register, Instagram action buttons to quiz cards"
```

---

### Task 5: Show teamSize and crossCollege in QuizDetail

**Files:**
- Modify: `client/src/components/QuizDetail.jsx`

**Step 1: Add team info below the eligibility tags section**

After the tags block (after line 168, the closing `</div>` of `quiz-detail__tags`), add:

```jsx
      {(quiz.teamSize || quiz.crossCollege != null) && (
        <div className="quiz-detail__team-info">
          {quiz.teamSize && (
            <span className="tag tag--lg" style={{ '--tag-color': 'var(--accent-gold)' }}>
              {quiz.teamSize === 1 ? 'Solo' : `Teams of ${quiz.teamSize}`}
            </span>
          )}
          {quiz.crossCollege === true && (
            <span className="tag tag--lg" style={{ '--tag-color': 'var(--accent-lime)' }}>
              Cross-college OK
            </span>
          )}
          {quiz.crossCollege === false && (
            <span className="tag tag--lg" style={{ '--tag-color': 'var(--accent-red)' }}>
              Same college only
            </span>
          )}
        </div>
      )}
```

**Step 2: Add CSS for quiz-detail__team-info**

Add in App.css after the quiz-detail__tags rules:

```css
.quiz-detail__team-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
```

**Step 3: Commit**

```
git add client/src/components/QuizDetail.jsx client/src/App.css
git commit -m "feat: show team size and cross-college info in quiz detail"
```

---

### Task 6: Verify with dev server

**Step 1: Start the dev server**

```
npm run dev
```

**Step 2: Open the app in browser**

Check `http://localhost:5173`:
- Quiz cards should show action buttons (WhatsApp, Register, Insta) at the bottom
- Clicking action buttons should open links without navigating to detail page
- Opening a quiz detail should show team info tags below eligibility

**Step 3: Verify existing quizzes render correctly**

The existing `data/quizzes.json` won't have `teamSize`/`crossCollege` yet — they'll show as null, which is fine. The card action buttons should appear for quizzes that have `poc.phone`, `regLink`, or `instagramLink`.
