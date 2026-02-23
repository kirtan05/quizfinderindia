import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

export function setupSecurity(app) {
  app.use(helmet());

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later' },
  });
  app.use('/api/', apiLimiter);

  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many admin requests, try again later' },
  });
  app.use('/api/admin/', adminLimiter);
}
