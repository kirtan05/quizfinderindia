import { getQuizzes, isMessageProcessed } from '../store.js';

export function isDuplicate(messageId) {
  return isMessageProcessed(messageId);
}

export function findSimilarQuiz(extracted, city) {
  if (!extracted.name || !extracted.date) return null;

  const quizzes = getQuizzes();
  const nameLower = extracted.name.toLowerCase().trim();

  return quizzes.find(q => {
    if (city && q.city && q.city !== city) return false;
    const nameMatch = q.name.toLowerCase().trim() === nameLower;
    const dateMatch = q.date === extracted.date;
    const orgMatch = !extracted.hostingOrg || !q.hostingOrg ||
      q.hostingOrg.toLowerCase() === extracted.hostingOrg.toLowerCase();

    return (nameMatch && dateMatch) || (nameMatch && orgMatch && dateMatch);
  }) || null;
}
