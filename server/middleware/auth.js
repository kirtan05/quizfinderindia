export function requireAuth(req, res, next) {
  // Check Bearer header first, then query param (for SSE which can't set headers)
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
