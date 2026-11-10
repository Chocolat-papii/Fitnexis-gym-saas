import { randomBytes } from 'node:crypto';
import { db } from '../config/db.js';
import { pages, pillars, faqs } from '../config/marketing.js';

const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-fitnexis_enquiry' : 'fitnexis_enquiry';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 1000 };
const submissions = new Map();
const interests = ['early-access', 'walkthrough', 'pricing', 'support'];
const emptyValues = { name: '', email: '', gym_name: '', interest: 'early-access', message: '' };

export function renderMarketing(req, res, page, extra = {}) {
  const meta = pages[page];
  return res.render('marketing/layout', { page, meta, pillars, faqs, year: new Date().getFullYear(), ...extra });
}

export const marketingPage = page => (req, res) => renderMarketing(req, res, page);

function contactPage(req, res, options = {}, status = 200) {
  res.set('Cache-Control', 'no-store');
  let csrf = req.cookies?.[cookieName];
  if (!/^[a-f0-9]{64}$/.test(csrf || '')) {
    csrf = randomBytes(32).toString('hex');
    res.cookie(cookieName, csrf, cookieOptions);
  }
  return renderMarketing(req, res.status(status), 'contact', {
    csrf, values: { ...emptyValues }, error: null, sent: false, ...options
  });
}

export function showContact(req, res) {
  const interest = interests.includes(req.query.interest) ? req.query.interest : 'early-access';
  return contactPage(req, res, { values: { ...emptyValues, interest } });
}

export async function submitContact(req, res) {
  const input = req.body || {};
  const values = Object.fromEntries(Object.keys(emptyValues).map(key => [key, typeof input[key] === 'string' ? input[key].trim() : '']));
  // Bound redisplayed input as well as database values.
  for (const [key, max] of Object.entries({ name: 150, email: 255, gym_name: 150, interest: 50, message: 3000 })) {
    if (values[key].length > max) return contactPage(req, res, { error: 'Please keep your details within the field length limits.' }, 400);
  }
  if (!req.cookies?.[cookieName] || input._csrf !== req.cookies[cookieName]) {
    return contactPage(req, res, { values, error: 'Your form expired. Please try submitting it again.' }, 403);
  }
  if (input.website) return contactPage(req, res, { sent: true });
  if (!values.name || !values.gym_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || !interests.includes(values.interest) || input.consent !== 'yes') {
    return contactPage(req, res, { values, error: 'Enter your name, gym name and a valid email, choose an enquiry type, and agree to be contacted.' }, 400);
  }
  const now = Date.now();
  for (const [key, entry] of submissions) if (entry.until <= now) submissions.delete(key);
  const limit = submissions.get(req.ip) || { count: 0, until: now + 60 * 60 * 1000 };
  if (limit.count >= 5) {
    res.set('Retry-After', String(Math.ceil((limit.until - now) / 1000)));
    return contactPage(req, res, { values, error: 'Too many enquiries from this connection. Please try again in an hour.' }, 429);
  }
  limit.count++;
  submissions.set(req.ip, limit);
  try {
    await db.query(`INSERT INTO platform_enquiries(name,email,gym_name,interest,message) VALUES($1,$2,$3,$4,$5)`,
      [values.name, values.email.toLowerCase(), values.gym_name, values.interest, values.message]);
  } catch (error) {
    console.error('Contact enquiry failed:', error.code || error.name);
    return contactPage(req, res, { values, error: 'We could not save your enquiry. Please try again shortly.' }, 503);
  }
  // Redirect after a successful write so refreshing the receipt cannot resubmit the form.
  res.cookie(cookieName + '_sent', 'yes', { ...cookieOptions, maxAge: 60000 });
  return res.redirect(303, '/contact/thank-you');
}

export function contactThanks(req, res) {
  if (req.cookies?.[cookieName + '_sent'] !== 'yes') return res.redirect('/contact');
  res.clearCookie(cookieName + '_sent', { ...cookieOptions, maxAge: undefined });
  return contactPage(req, res, { sent: true });
}

export function showGymFinder(req, res) {
  return renderMarketing(req, res, 'find-gym', { error: null, slug: '' });
}

export async function findGym(req, res) {
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim().toLowerCase() : '';
  const fail = (error, status = 400) => renderMarketing(req, res.status(status), 'find-gym', { error, slug: slug.slice(0, 63) });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63) return fail('Enter the gym slug from your welcome message, such as golds-gym.');
  try {
    const { rows } = await db.query('SELECT slug FROM gyms WHERE slug=$1 LIMIT 1', [slug]);
    if (!rows[0]) return fail('We could not find that gym. Check the slug with your gym team and try again.', 404);
    const local = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const port = /^\d+$/.test(req.get('host')?.split(':')[1] || '') ? ':' + req.get('host').split(':')[1] : '';
    return res.redirect(local ? `http://${slug}.localhost${port}/login` : `https://${slug}.fitnexis.app/login`);
  } catch (error) {
    console.error('Gym finder failed:', error.code || error.name);
    return fail('Gym search is temporarily unavailable. You can still use the login address provided by your gym.', 503);
  }
}
