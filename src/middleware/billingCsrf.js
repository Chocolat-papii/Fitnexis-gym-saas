import { createHmac, timingSafeEqual } from 'node:crypto';

export function csrfToken(req) {
  const secret = process.env.JWT_SECRET;
  if (!secret || !req.cookies?.token) return '';
  return createHmac('sha256', secret).update(`fitnexis-billing:${req.cookies.token}`).digest('hex');
}

export function billingCsrf(req, res, next) {
  const expected = csrfToken(req);
  const supplied = req.get('x-billing-csrf') || req.body?._csrf || '';
  if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || !expected || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Invalid billing security token. Refresh the page.' });
  }
  return next();
}
