#!/usr/bin/env node
/**
 * One-time cleanup of quizzes.json:
 *   1. Normalize all city names
 *   2. Fix cities using quiz-name detection (e.g., "Mumbai Quiz Festival" → Mumbai)
 *   3. Remove cross-city duplicates (same name + same date)
 *   4. Remove very low confidence entries (< 0.3)
 *
 * Usage: node server/scripts/cleanup-quizzes.js [--dry-run]
 */
import { getQuizzes, saveQuizzes } from '../store.js';
import { diceCoefficient } from '../sync/fuzzy.js';
import { normalizeCity, detectCityInText } from '../utils/cities.js';

const dryRun = process.argv.includes('--dry-run');
const quizzes = getQuizzes();
console.log(`Loaded ${quizzes.length} quizzes${dryRun ? ' (dry run)' : ''}\n`);

// Step 1: Normalize cities and fix via name detection
let cityFixes = 0;
for (const q of quizzes) {
  const original = q.city;
  const normalized = normalizeCity(q.city);
  const nameCity = detectCityInText(q.name);
  const venueCity = detectCityInText(q.venue);
  const detected = nameCity || venueCity;

  // If name or venue mentions a city and current assignment differs, fix it
  if (detected && normalized !== detected) {
    q.city = detected;
    console.log(`  City fix: "${q.name}" — ${original} → ${detected} (from ${nameCity ? 'name' : 'venue'})`);
    cityFixes++;
  } else if (normalized !== original) {
    q.city = normalized;
    cityFixes++;
  }
}
console.log(`\nCity fixes: ${cityFixes}\n`);

// Step 2: Deduplicate (same name + same date, regardless of city)
// For null-date quizzes: group by name + city instead
const groups = [];
for (const q of quizzes) {
  if (!q.name) {
    groups.push([q]);
    continue;
  }

  let matched = false;
  for (const group of groups) {
    const rep = group[0];
    if (!rep.name) continue;

    // Both have dates: must match exactly
    if (rep.date && q.date && rep.date !== q.date) continue;
    // One has date, other doesn't: not a match
    if ((rep.date == null) !== (q.date == null)) continue;
    // Both null-date: require same city too (less context to match on)
    if (!rep.date && !q.date && rep.city !== q.city) continue;

    if (diceCoefficient(rep.name, q.name) >= 0.75) {
      group.push(q);
      matched = true;
      break;
    }
  }

  if (!matched) groups.push([q]);
}

const deduped = [];
let dupesRemoved = 0;
for (const group of groups) {
  if (group.length === 1) {
    deduped.push(group[0]);
    continue;
  }

  // Pick the best: prefer name-city match, then highest confidence, then earliest
  group.sort((a, b) => {
    const aNameCity = detectCityInText(a.name);
    const bNameCity = detectCityInText(b.name);
    const aMatch = aNameCity && a.city === aNameCity ? 1 : 0;
    const bMatch = bNameCity && b.city === bNameCity ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;
    if ((b.confidence || 0) !== (a.confidence || 0)) return (b.confidence || 0) - (a.confidence || 0);
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  deduped.push(group[0]);
  dupesRemoved += group.length - 1;
  const removed = group.slice(1);
  console.log(`  Dedup: "${group[0].name}" (${group[0].date}) — kept [${group[0].city}], removed ${removed.length} from [${removed.map(q => q.city).join(', ')}]`);
}
console.log(`\nDuplicates removed: ${dupesRemoved}\n`);

// Step 3: Remove very low confidence entries
const filtered = deduped.filter(q => {
  if ((q.confidence || 1) < 0.3) {
    console.log(`  Low confidence removed: "${q.name}" (${q.confidence})`);
    return false;
  }
  return true;
});
const lowConfRemoved = deduped.length - filtered.length;
console.log(`\nLow confidence removed: ${lowConfRemoved}`);

// Summary
console.log(`\n=== Summary ===`);
console.log(`  Before: ${quizzes.length}`);
console.log(`  After:  ${filtered.length}`);
console.log(`  City fixes: ${cityFixes}`);
console.log(`  Dupes removed: ${dupesRemoved}`);
console.log(`  Low confidence removed: ${lowConfRemoved}`);
console.log(`  Total removed: ${quizzes.length - filtered.length}`);

if (!dryRun) {
  saveQuizzes(filtered);
  console.log(`\nSaved to quizzes.json.`);
} else {
  console.log(`\nDry run — no changes written.`);
}
