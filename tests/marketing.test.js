import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import routes from '../src/routes/landingPageRoutes.js';
import platformRoutes from '../src/routes/platform.routes.js';
import { db } from '../src/config/db.js';

async function serve() {
  const app = express();
  app.engine('html', ejs.renderFile);
  app.set('view engine', 'html');
  app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
  app.use(express.urlencoded({ extended: false }), cookieParser());
  app.use('/assets', express.static(fileURLToPath(new URL('../src/views/assets', import.meta.url))));
  app.use('/platform', platformRoutes);
  app.use((req, res, next) => { if (req.get('x-test-gym')) req.gym = { name: 'Test Gym', slug: 'test-gym' }; next(); });
  app.use(routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, request: (path, options) => fetch(base + path, { redirect: 'manual', ...options }), close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

test('public pages render, internal links and local assets resolve, and tenant homes stay separate', async () => {
  const originalQuery=db.query;db.query=async(sql,...args)=>sql.includes('FROM saas_plans')?{rows:[]}:sql.includes('FROM platform_billing_config')?{rows:[{commission_bps:200,fee_bearer:'subaccount'}]}:originalQuery.call(db,sql,...args);
  const app = await serve();
  try {
    const routes = ['/', '/features', '/about', '/pricing', '/faq', '/contact', '/find-gym'];
    const documents = new Map();
    const assets = new Set();
    for (const path of routes) {
      const response = await app.request(path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      documents.set(path, html);
      assert.match(html, /^<!doctype html>/i);
      assert.equal((html.match(/<h1[ >]/g) || []).length, 1, path);
      assert.match(html, /<meta name="description" content="[^"]+"/);
      assert.match(html, /<link rel="canonical"/);
      assert.ok(!html.includes('/register-gym'));
      for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assets.add(match[1]);
    }
    for (const [path, html] of documents) {
      for (const match of html.matchAll(/href="([^\"]+)"/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), app.base + path);
        if (url.origin !== app.base || !documents.has(url.pathname)) continue;
        if (url.hash) assert.ok(documents.get(url.pathname).includes(`id="${url.hash.slice(1)}"`), `${path}: ${url.hash}`);
      }
    }
    for (const path of assets) {
      const asset = await app.request(path);
      assert.equal(asset.status, 200, path);
      await asset.arrayBuffer();
    }
    assert.ok(documents.get('/').includes('Illustrative preview'));
    assert.ok(documents.get('/features').includes('ON THE ROADMAP'));
    assert.ok(documents.get('/pricing').includes('Pricing to be announced'));
    assert.equal((await app.request('/get-started')).headers.get('location'), '/contact?interest=early-access');
    assert.equal((await app.request('/login')).headers.get('location'), '/find-gym');
    assert.equal((await app.request('/signup')).headers.get('location'), '/get-started');
    assert.equal((await app.request('/register-gym')).status, 404);
    assert.equal((await app.request('/register', { method: 'POST' })).status, 404);
    const tenant = await app.request('/', { headers: { 'x-test-gym': '1' } });
    assert.equal(tenant.status, 200);
    assert.ok(!(await tenant.text()).includes('A stronger gym.'));
    const sitemap = await app.request('/sitemap.xml');
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.ok(xml.includes('https://fitnexis.app/features'));
    assert.ok(!xml.includes('/platform'));
    assert.ok((await (await app.request('/robots.txt')).text()).includes('Disallow: /platform'));
  } finally { db.query=originalQuery; await app.close(); }
});

test('contact stores validated enquiries, handles errors, and exposes a protected review inbox', async () => {
  const original = db.query;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'marketing-test-only-secret';
  const saved = [];
  let unavailable = false;
  let reviewed = false;
  db.query = async (sql, params) => {
    if (sql.includes('INSERT INTO platform_enquiries')) {
      if (unavailable) throw Object.assign(new Error('unavailable'), { code: 'TEST_UNAVAILABLE' });
      saved.push(params);
      return { rows: [] };
    }
    if (sql.includes('s.id=$1')) return { rows: [{ id: 1, name: 'Platform owner', role:'fitnexis_super_admin', session_id: 'session-id' }] };
    if (sql.startsWith('SELECT id,name,email')) return { rows: [{ id: 1, name: saved[0][0], email: saved[0][1], gym_name: saved[0][2], interest: saved[0][3], message: saved[0][4], created_at: new Date(), reviewed_at: null }] };
    if (sql.startsWith('SELECT COUNT(*)')) return { rows: [{ total: '1', unread: '1' }] };
    if (sql.startsWith('UPDATE platform_enquiries')) { reviewed = true; return { rowCount: params[0] === '1' ? 1 : 0 }; }
    throw new Error('Unexpected test SQL');
  };
  const app = await serve();
  try {
    const response = await app.request('/contact');
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('fitnexis_enquiry=')).split(';')[0];
    const csrf = cookie.split('=')[1];
    const input = { _csrf: csrf, name: '<script>owner</script>', email: 'OWNER@example.invalid', gym_name: 'Independent Gym', interest: 'early-access', message: '<script>alert(1)</script>', consent: 'yes' };
    const post = (body, cookies = cookie, path = '/contact') => app.request(path, { method: 'POST', headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    assert.equal((await post({ ...input, _csrf: 'wrong' })).status, 403);
    assert.equal((await post({ ...input, consent: 'no' })).status, 400);
    assert.equal((await post({ ...input, email: 'bad' })).status, 400);
    assert.equal((await post({ ...input, message: 'x'.repeat(3001) })).status, 400);
    assert.equal((await post({ ...input, website: 'spam' })).status, 200);
    assert.equal(saved.length, 0);
    unavailable = true;
    const failed = await post(input);
    assert.equal(failed.status, 503);
    const failedHtml = await failed.text();
    assert.ok(failedHtml.includes('Independent Gym'));
    assert.ok(!failedHtml.includes('<script>alert(1)</script>'));
    unavailable = false;
    const success = await post(input);
    assert.equal(success.status, 303);
    assert.equal(success.headers.get('location'), '/contact/thank-you');
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], [input.name, 'owner@example.invalid', input.gym_name, input.interest, input.message]);
    assert.equal((await app.request('/contact/thank-you')).headers.get('location'), '/contact');
    const receiptCookie = success.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok((await (await app.request('/contact/thank-you', { headers: { cookie: cookie + '; ' + receiptCookie } })).text()).includes('Your enquiry is in.'));
    assert.equal((await app.request('/platform/enquiries')).headers.get('location'), '/platform/login');
    const token = jwt.sign({}, process.env.JWT_SECRET, { audience: 'fitnexis-platform', issuer: 'fitnexis', subject: '1', jwtid: 'session-id', expiresIn: '1h' });
    const adminCookie = `fitnexis_platform=${token}; fitnexis_platform_csrf=${'a'.repeat(64)}`;
    const inbox = await app.request('/platform/enquiries', { headers: { cookie: adminCookie } });
    assert.equal(inbox.status, 200);
    const inboxHtml = await inbox.text();
    assert.ok(inboxHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!inboxHtml.includes('<script>alert(1)</script>'));
    assert.equal((await post({ _csrf: 'bad' }, adminCookie, '/platform/enquiries/1/review')).status, 403);
    assert.equal(reviewed, false);
    assert.equal((await post({ _csrf: 'a'.repeat(64) }, adminCookie, '/platform/enquiries/1/review')).status, 303);
    assert.equal(reviewed, true);
    assert.equal((await post({ _csrf: 'a'.repeat(64) }, adminCookie, '/platform/enquiries/2/review')).status, 404);
    for(let i = 0; i < 3; i++) assert.equal((await post(input)).status, 303);
    assert.equal((await post(input)).status, 429);
  } finally {
    db.query = original;
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    await app.close();
  }
});

test('gym finder validates slugs and redirects only to known gyms', async () => {
  const original = db.query;
  let queried;
  db.query = async (sql, params) => { queried = params; return { rows: params[0] === 'known-gym' ? [{ slug: params[0] }] : [] }; };
  const app = await serve();
  try {
    assert.equal((await app.request('/find-gym/search?slug=evil.com')).status, 400);
    assert.equal(queried, undefined);
    assert.equal((await app.request('/find-gym/search?slug=unknown')).status, 404);
    const found = await app.request('/find-gym/search?slug=KNOWN-GYM');
    assert.equal(found.status, 302);
    assert.equal(found.headers.get('location'), `http://known-gym.localhost:${new URL(app.base).port}/login`);
    assert.deepEqual(queried, ['known-gym']);
  } finally { db.query = original; await app.close(); }
});
