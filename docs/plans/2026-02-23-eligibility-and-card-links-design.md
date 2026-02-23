# Eligibility Filtering + Card Action Links

**Date:** 2026-02-23

## Problem

1. Eligibility extraction mixes team-size and cross-college info with actual eligibility criteria
2. Quiz cards require tapping through to detail page just to register or contact the organizer
3. POC WhatsApp field is almost always null even when a phone number exists

## Design

### Extraction prompt (extractor.js)

Add two new fields to the LLM JSON schema:

- `teamSize`: max team size as number (1, 2, 3) or null
- `crossCollege`: boolean or null

Update eligibility instructions: eligibility should only contain age/degree/university restrictions. Team size and cross-college go in their own fields.

POC improvement: if only one phone number and no separate WhatsApp, set `whatsapp` = `phone`.

### Normalizer (eligibility.js)

- Strip team-size and cross-college strings from raw eligibility before normalizing
- Drop JNU patterns (too rare to justify)
- Keep: Open, U23, U25, UG, PG, Research, DU Only
- Fallback: Custom

### QuizCard action bar

Bottom of each card, row of small icon buttons:

- WhatsApp (if poc.phone or poc.whatsapp) -> wa.me link
- Register (if regLink) -> opens form
- Instagram (if instagramLink) -> opens IG

Buttons use stopPropagation so card click still works.

### QuizDetail additions

Show teamSize and crossCollege alongside eligibility tags.

### Model

Keep gpt-4o. No change.
