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
 * Uses Dice coefficient on quiz name + exact date match + city gating.
 */
export function findSimilarQuiz(extracted, city) {
  if (!extracted.name || !extracted.date) return null;

  const quizzes = getQuizzes();

  return quizzes.find(q => {
    // City gating: skip quizzes from a different city
    if (city && q.city && q.city !== city) return false;

    const dateMatch = q.date === extracted.date;
    if (!dateMatch) return false;

    const similarity = diceCoefficient(extracted.name, q.name);
    return similarity >= SIMILARITY_THRESHOLD;
  }) || null;
}
