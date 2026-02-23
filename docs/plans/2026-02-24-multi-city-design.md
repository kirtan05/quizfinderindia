# Multi-City Support Design — Quiz Finder India

**Date**: 2026-02-24
**Status**: Approved

## Overview

Transform "Delhi Quiz Board" into "Quiz Finder \<City\>" — a multi-city quiz aggregator. Cities are defined via a config file mapping WhatsApp group IDs to city names. Users pick a city on first visit via a modal; all quiz data is scoped to their selection.

## Approach

**Approach A**: Add a `city` field to each quiz record. A single `data/city-groups.json` config file maps WhatsApp groups to cities. No per-city data files, no database migration. Scales fine for hundreds of quizzes per city.

## Data Model

### New config: `data/city-groups.json`

```json
{
  "cities": {
    "Delhi": {
      "groups": ["120363123456789@g.us"]
    },
    "Bangalore": {
      "groups": ["120363111222333@g.us"]
    }
  }
}
```

Admin manually edits this file. Cities are dynamic — whatever's here shows in the picker.

### Quiz schema additions

```
"city": "Delhi"                    // stamped at sync time from config
"sourceGroupId": "120363...@g.us"  // audit trail for which group
```

### Migration

Existing quizzes get `city: "Delhi"` and `sourceGroupId: null`.

### New API endpoint

`GET /api/cities` — returns array of city names derived from config.

## Sync Pipeline

1. Admin triggers sync
2. Server reads `data/city-groups.json` → flat list of `{groupId, city}` pairs
3. For each group: fetch messages, extract quizzes, stamp `city` and `sourceGroupId`
4. Dedup runs per-city (same name + date + city = duplicate)
5. `WHATSAPP_GROUP_ID` env var deprecated — config file is source of truth
6. Extraction prompt made city-agnostic (no "Delhi" hardcoding)
7. `sync-state.json` processedMessageIds works across groups (globally unique IDs)

## Frontend

### City Picker Modal (first visit)

- Full-screen overlay, dark backdrop
- "Choose your city" title
- Large card/pill buttons, one per city from `/api/cities`
- Selection saved to `localStorage('qfb_city')`, modal closes
- If only one city in config, skip modal entirely

### Header Branding

- "Quiz Finder" in regular text + city name in accent color (`--accent-orange`)
- Clicking the city name reopens the modal to switch
- Subtle animated underline or glow on city name to indicate interactivity

### Data Scoping

- All quiz fetches include `?city=<selected>` parameter
- Filters (mode, eligibility, search) work within city scope
- City stored in localStorage only, not URL — keeps quiz detail links universal

## Admin Panel

- No UI changes for group mapping (config file only)
- "Trigger Sync" syncs ALL configured groups across all cities at once
- Admin panel still shows connection status, QR flow unchanged

## Files Changed

| File | Change |
|------|--------|
| `data/city-groups.json` | New config file |
| `server/store.js` | Add city-groups read/write helpers |
| `server/routes/quizzes.js` | Add `city` query filter, `GET /cities` endpoint |
| `server/sync/whatsapp.js` | Multi-group iteration, city stamping |
| `server/sync/extractor.js` | Remove "Delhi" from prompt |
| `client/src/App.jsx` | City state, modal, header branding |
| `client/src/components/CityPicker.jsx` | New modal component |
| `client/src/components/Filters.jsx` | No change (city is header-level, not filter-level) |
| `client/src/App.css` | Modal styles, header branding styles |
| `scripts/migrate-city.js` | One-time migration for existing quizzes |
