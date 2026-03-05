import { getQuizzes, isSourceItemProcessed } from '../store.js';
import { diceCoefficient } from './fuzzy.js';

const SIMILARITY_THRESHOLD = 0.75;

/**
 * Check if a source item has already been processed.
 * @param {string} sourceType - e.g. 'whatsapp', 'instagram'
 * @param {string} sourceId   - source-specific unique ID
 */
export function isDuplicate(sourceType, sourceId) {
  return isSourceItemProcessed(sourceType, sourceId);
}

/** Backward-compat alias for WhatsApp-only callers. */
export function isDuplicateMessage(messageId) {
  return isDuplicate('whatsapp', messageId);
}

/**
 * Find an existing quiz that fuzzy-matches the extracted data.
 * Uses Dice coefficient on quiz name + exact date match.
 * No city gating — the same event posted by sources in different cities
 * should still be caught as a duplicate.
 */
export function findSimilarQuiz(extracted) {
  if (!extracted.name) return null;

  const quizzes = getQuizzes();

  return quizzes.find(q => {
    if (!q.name) return false;

    // If both have dates, they must match
    if (extracted.date && q.date && extracted.date !== q.date) return false;
    // If one has a date and the other doesn't, not a match
    if ((extracted.date == null) !== (q.date == null)) return false;

    const similarity = diceCoefficient(extracted.name, q.name);
    return similarity >= SIMILARITY_THRESHOLD;
  }) || null;
}
