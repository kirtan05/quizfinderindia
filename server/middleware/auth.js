export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
