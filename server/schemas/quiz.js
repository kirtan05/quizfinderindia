import { z } from 'zod';

export const EligibilityCategory = z.enum([
  'U18', 'U23', 'U25', 'U30',
  'Open',
  'DU Only', 'JNU Only', 'University Restricted',
  'UG', 'PG', 'Research',
  'Custom'
]);

export const QuizSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['published', 'draft', 'flagged']).default('published'),
  confidence: z.number().min(0).max(1),
  name: z.string().min(1),
  description: z.string().default(''),
  date: z.string().nullable().default(null),
  time: z.string().nullable().default(null),
  venue: z.string().nullable().default(null),
  venueMapLink: z.string().url().nullable().default(null),
  eligibility: z.array(z.string()).default([]),
  eligibilityCategories: z.array(EligibilityCategory).default([]),
  hostingOrg: z.string().nullable().default(null),
  quizMasters: z.array(z.string()).default([]),
  poc: z.object({
    name: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    whatsapp: z.string().nullable().default(null),
  }).default({}),
  regLink: z.string().url().nullable().default(null),
  instagramLink: z.string().url().nullable().default(null),
  posterImage: z.string().nullable().default(null),
  sourceMessageId: z.string(),
  sourceTimestamp: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  extractedFields: z.array(z.string()).default([]),
});

export const QuizUpdateSchema = QuizSchema.partial().omit({
  id: true,
  sourceMessageId: true,
  sourceTimestamp: true,
  createdAt: true,
});

export const QuizCreateSchema = QuizSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sourceMessageId: true,
  sourceTimestamp: true,
  confidence: true,
  extractedFields: true,
});
