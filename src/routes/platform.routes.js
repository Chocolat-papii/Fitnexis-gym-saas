import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { db } from '../config/db.js';
import { platformOverview } from '../services/platform.service.js';
import { createPlatformGym, gymFormValues } from '../services/platformGyms.service.js';

const router = Router();
const production = process.env.NODE_ENV === 'production';
const sessionCookie = production ? '__Host-fitnexis_platform' : 'fitnexis_platform';
const csrfCookie = production ? '__Host-fitnexis_platform_csrf' : 'fitnexis_platform_csrf';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
const attempts = new Map();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  let csrf = req.cookies[csrfCookie];
  if (!csrf || !/^[a-f0-9]{64}$/.test(csrf)) {
    csrf = randomBytes(32).toString('hex');
    res.cookie(csrfCookie, csrf, cookieOptions);
  }
  res.locals.csrf = csrf;
  next();
});

function csrfCheck(req, res, next) {
  if (!req.cookies[csrfCookie] || req.body?._csrf !== req.cookies[csrfCookie]) {
    return res.status(403).send('Form expired. Reload the page and try again.');
  }
  next();
}

export async function requirePlatformAdmin(req, res, next) {
  let claims;
  try {
    claims = jwt.verify(req.cookies[sessionCookie] || '', process.env.JWT_SECRET,
      { audience: 'fitnexis-platform', issuer: 'fitnexis', algorithms: ['HS256'] });
  } catch {
    return res.redirect('/platform/login');
  }
  const { rows } = await db.query(`SELECT a.id,a.name,a.email,s.id AS session_id
    FROM platform_sessions s JOIN platform_admins a ON a.id=s.admin_id
    WHERE s.id=$1 AND a.id=$2 AND a.is_active=true AND s.logged_out_at IS NULL AND s.expires_at>NOW()`,
  [claims.jti, claims.sub]);
  if (!rows[0]) return res.redirect('/platform/login');
  req.platformAdmin = rows[0];
  next();
}

router.get('/login', (req, res) => res.render('platform/login', { error: null }));
router.post('/login', csrfCheck, async (req, res) => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (attempt.count >= 10) {
    res.set('Retry-After', String(Math.ceil((attempt.until - now) / 1000)));
    return res.status(429).render('platform/login', { error: 'Too many attempts. Please try again in 15 minutes.' });
  }
  attempt.count++;
  attempts.set(key, attempt);
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || email.length > 255 || !password || Buffer.byteLength(password) > 72) {
    return res.status(401).render('platform/login', { error: 'Invalid email or password.' });
  }
  const { rows: [admin] } = await db.query('SELECT * FROM platform_admins WHERE email=$1 AND is_active=true', [email]);
  // A valid dummy hash keeps unknown-email attempts on the password comparison path.
  const valid = await bcrypt.compare(password, admin?.password || '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxuBUa.KI8L3YNYD70.jP4N.qKu');
  if (!admin || !valid) return res.status(401).render('platform/login', { error: 'Invalid email or password.' });
  const { rows: [session] } = await db.query(`INSERT INTO platform_sessions(admin_id,expires_at)
    VALUES($1,NOW()+INTERVAL '2 hours') RETURNING id`, [admin.id]);
  const token = jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS256', subject: String(admin.id),
    jwtid: session.id, audience: 'fitnexis-platform', issuer: 'fitnexis', expiresIn: '2h' });
  attempts.delete(key);
  res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000 });
  res.cookie(csrfCookie, randomBytes(32).toString('hex'), cookieOptions);
  res.redirect('/platform');
});

router.use(requirePlatformAdmin);
router.use((req, res, next) => {
  res.locals.admin = req.platformAdmin;
  res.locals.section = 'overview';
  next();
});
router.get('/gyms/new', (req, res) => {
  res.render('platform/new-gym', { section: 'new-gym', values: gymFormValues(), error: null });
});
router.post('/gyms', csrfCheck, async (req, res) => {
  try {
    await createPlatformGym(req.body);
    res.redirect(303, '/platform?created=1#gyms');
  } catch (error) {
    if (![400, 409].includes(error.status)) throw error;
    res.status(error.status).render('platform/new-gym', {
      section: 'new-gym', values: gymFormValues(req.body), error: error.message
    });
  }
});
router.get('/billing', (req, res) => res.render('platform/billing', { section: 'billing' }));
router.get('/enquiries', async (req, res) => {
  const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const [{ rows }, { rows: [counts] }] = await Promise.all([
    db.query('SELECT id,name,email,gym_name,interest,message,created_at,reviewed_at FROM platform_enquiries ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET $1', [(page - 1) * 25]),
    db.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE reviewed_at IS NULL) AS unread FROM platform_enquiries')
  ]);
  res.render('platform/enquiries', { section: 'enquiries', enquiries: rows, counts, page });
});
router.post('/enquiries/:id/review', csrfCheck, async (req, res) => {
  if (!/^[1-9]\d{0,8}$/.test(req.params.id)) return res.status(400).send('Invalid enquiry.');
  const result = await db.query('UPDATE platform_enquiries SET reviewed_at=COALESCE(reviewed_at,NOW()) WHERE id=$1', [req.params.id]);
  if (!result.rowCount) return res.status(404).send('Enquiry not found.');
  res.redirect(303, '/platform/enquiries');
});
router.get('/', async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 150) : '';
  const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const data = await platformOverview(search, page);
  res.render('platform/dashboard', { ...data, created: req.query.created === '1' });
});
router.post('/logout', csrfCheck, async (req, res) => {
  await db.query('UPDATE platform_sessions SET logged_out_at=NOW() WHERE id=$1', [req.platformAdmin.session_id]);
  res.clearCookie(sessionCookie, cookieOptions);
  res.clearCookie(csrfCookie, cookieOptions);
  res.redirect('/platform/login');
});

router.use((err, req, res, next) => {
  console.error('Platform request failed:', err.code || err.name);
  res.status(503).send('The Fitnexis dashboard is temporarily unavailable. Please try again shortly.');
});
export default router;
