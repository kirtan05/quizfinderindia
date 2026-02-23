import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUIZZES_PATH = path.join(__dirname, '..', 'data', 'quizzes.json');

const quizzes = JSON.parse(readFileSync(QUIZZES_PATH, 'utf-8'));
let updated = 0;

for (const q of quizzes) {
  if (!q.city) {
    q.city = 'Delhi';
    updated++;
  }
  if (!q.sourceGroupId) {
    q.sourceGroupId = null;
  }
}

writeFileSync(QUIZZES_PATH, JSON.stringify(quizzes, null, 2));
console.log(`Migrated ${updated} quizzes. All now have city="Delhi".`);
