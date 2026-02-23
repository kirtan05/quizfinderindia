import { Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { getQuizzes, getQuizById, addQuiz, updateQuiz, deleteQuiz, getCityList } from '../store.js';
import { requireAuth } from '../middleware/auth.js';
import { QuizCreateSchema, QuizUpdateSchema } from '../schemas/quiz.js';
import { normalizeEligibility } from '../utils/eligibility.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// --- Public routes ---

router.get('/cities', (req, res) => {
  res.json(getCityList());
});

router.get('/', (req, res) => {
  let quizzes = getQuizzes().filter(q => q.status === 'published');

  const { eligibility, org, upcoming, search, mode, city } = req.query;

  if (city) {
    quizzes = quizzes.filter(q => q.city === city);
  }

  if (eligibility) {
    const filters = eligibility.split(',');
    quizzes = quizzes.filter(q =>
      q.eligibilityCategories.some(e => filters.includes(e))
    );
  }

  if (org) {
    const orgLower = org.toLowerCase();
    quizzes = quizzes.filter(q =>
      q.hostingOrg?.toLowerCase().includes(orgLower)
    );
  }

  if (upcoming === 'true') {
    const today = new Date().toISOString().split('T')[0];
    quizzes = quizzes.filter(q => !q.date || q.date >= today);
  }

  if (mode) {
    quizzes = quizzes.filter(q => {
      const quizMode = q.mode || (q.venue && !/\bonline\b/i.test(q.venue) ? 'offline' : 'online');
      return quizMode === mode;
    });
  }

  if (search) {
    const s = search.toLowerCase();
    quizzes = quizzes.filter(q =>
      q.name.toLowerCase().includes(s) ||
      q.description.toLowerCase().includes(s) ||
      q.hostingOrg?.toLowerCase().includes(s) ||
      q.quizMasters.some(qm => qm.toLowerCase().includes(s))
    );
  }

  quizzes.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  res.json(quizzes);
});

// --- Admin routes (must be above /:id to avoid interception) ---

router.get('/admin/all', requireAuth, (req, res) => {
  const quizzes = getQuizzes();
  res.json(quizzes);
});

router.get('/admin/flagged', requireAuth, (req, res) => {
  const quizzes = getQuizzes().filter(q => q.status === 'flagged');
  res.json(quizzes);
});

router.get('/:id', (req, res) => {
  const quiz = getQuizById(req.params.id);
  if (!quiz || quiz.status !== 'published') {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  res.json(quiz);
});

router.post('/', requireAuth, (req, res) => {
  const parsed = QuizCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const data = parsed.data;
  data.description = sanitizeHtml(data.description);

  const quiz = {
    ...data,
    id: uuidv4(),
    status: data.status || 'published',
    confidence: 1.0,
    eligibilityCategories: normalizeEligibility(data.eligibility),
    sourceMessageId: `manual-${Date.now()}`,
    sourceTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    extractedFields: [],
  };

  addQuiz(quiz);
  res.status(201).json(quiz);
});

router.patch('/:id', requireAuth, (req, res) => {
  const parsed = QuizUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const updates = parsed.data;
  if (updates.description) {
    updates.description = sanitizeHtml(updates.description);
  }
  if (updates.eligibility) {
    updates.eligibilityCategories = normalizeEligibility(updates.eligibility);
  }

  const quiz = updateQuiz(req.params.id, updates);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json(quiz);
});

router.post('/:id/publish', requireAuth, (req, res) => {
  const quiz = updateQuiz(req.params.id, { status: 'published' });
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json(quiz);
});

router.delete('/:id', requireAuth, (req, res) => {
  const deleted = deleteQuiz(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Quiz not found' });
  res.json({ success: true });
});

export default router;
