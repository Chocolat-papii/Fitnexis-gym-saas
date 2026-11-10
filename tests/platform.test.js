import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { db } from '../src/config/db.js';
import router from '../src/routes/platform.routes.js';
import { platformOverview } from '../src/services/platform.service.js';
import { createPlatformGym } from '../src/services/platformGyms.service.js';
import landingRoutes from '../src/routes/landingPageRoutes.js';

const gymInput = { name: 'New Gym', slug: 'new-gym', gymMail: 'contact@example.invalid',
  address: '123 Main Road', firstname: 'Gym', lastname: 'Owner', phone: '0123456789',
  email: 'admin@example.invalid', password: 'new-gym-password-123' };

test('gym creation validates before connecting and rolls back failed administrator creation', async () => {
  const original = db.connect;
  const calls = [];
  let failure = false;
  let released = 0;
  db.connect = async () => ({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (failure && sql.includes('INSERT INTO users')) throw Object.assign(new Error('insert failed'), { code: '23505' });
      return { rows: sql.includes('INSERT INTO gyms') ? [{ id: 'new-id' }] : [] };
    },
    release: () => released++
  });
  try {
    for (const patch of [{ firstname: '' }, { slug: 'platform' }, { slug: 'bad.domain' }, { gymMail: 'bad' }, { password: 'short' }, { password: 'é'.repeat(37) }]) {
      await assert.rejects(() => createPlatformGym({ ...gymInput, ...patch }), { status: 400 });
    }
    assert.equal(calls.length, 0);
    assert.deepEqual(await createPlatformGym({ ...gymInput, slug: ' NEW-GYM ', email: ' ADMIN@example.invalid ' }), { id: 'new-id' });
    assert.equal(calls[0].sql, 'BEGIN');
    assert.deepEqual(calls[1].params, ['New Gym', 'new-gym', 'contact@example.invalid', '123 Main Road']);
    assert.equal(calls[2].params[3], 'admin@example.invalid');
    assert.equal(calls[2].params[5], 'new-id');
    assert.equal(await bcrypt.compare(gymInput.password, calls[2].params[4]), true);
    assert.equal(calls[3].sql, 'COMMIT');
    assert.equal(released, 1);
    failure = true;
    calls.length = 0;
    await assert.rejects(() => createPlatformGym(gymInput), { status: 409 });
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!calls.some(call => call.sql === 'COMMIT'));
    assert.equal(released, 2);
  } finally { db.connect = original; }
});

test('platform overview parameterizes search and pagination', async () => {
  const original = db.query;
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes('matching_gyms') ? [{ matching_gyms: '26' }] : [] };
  };
  try {
    const result = await platformOverview("x' OR true --", 2);
    assert.equal(result.total, 26);
    const directory = calls.find(call => call.sql.includes('LIMIT 25'));
    assert.deepEqual(directory.params, ["%x' OR true --%", 25]);
    assert.ok(!directory.sql.includes("x' OR true --"));
    assert.ok(calls.filter(call => call.sql.includes('SUM(amount)')).every(call =>
      call.sql.includes("status='succeeded'") && call.sql.includes("currency='ZAR'")));
  } finally { db.query = original; }
});

test('platform authentication, rendering, CSRF and revocable sessions', async () => {
  const original = db.query;
  const originalConnect = db.connect;
  let gymWrites = 0;
  let duplicateGym = false;
  db.connect = async () => ({
    query: async sql => {
      if (sql.includes('INSERT INTO gyms')) {
        if (duplicateGym) throw Object.assign(new Error('duplicate'), { code: '23505' });
        gymWrites++;
      }
      return { rows: [{ id: 'new-gym-id' }] };
    },
    release() {}
  });
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'platform-test-only-secret';
  const password = await bcrypt.hash('test-password-123', 4);
  const id = 'ef1c2944-df29-470e-8f58-57556141acdd';
  let revoked = false;
  let disabled = false;
  db.query = async (sql, params) => {
    if (sql.includes('SELECT * FROM platform_admins')) return { rows: params[0] === 'owner@example.invalid' ? [{ id: 1, password }] : [] };
    if (sql.includes('INSERT INTO platform_sessions')) return { rows: [{ id }] };
    if (sql.includes('s.id=$1')) return { rows: revoked || disabled ? [] : [{ id: 1, name: 'Owner <script>', session_id: id }] };
    if (sql.includes('UPDATE platform_sessions')) { revoked = true; return { rows: [] }; }
    if (sql.includes('LIMIT 25')) return { rows: [{ name: '<script>alert(1)</script>', slug: 'test', members: '2', active_members: '1', checkins: '4', collected: '100.00', created_at: new Date() }] };
    if (sql.includes('matching_gyms')) return { rows: [{ gyms: '1', matching_gyms: '1', members: '2', active_members: '1', checkins: '4', collected: '100' }] };
    if (sql.includes('generate_series')) return { rows: [{ month: 'Nov 2026', gyms: '1', members: '2' }] };
    return { rows: [] };
  };
  const app = express();
  app.engine('html', ejs.renderFile);
  app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
  app.set('view engine', 'html');
  app.use(express.urlencoded({ extended: false }), cookieParser());
  app.use('/platform', router);
  app.use(landingRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/platform`;
  const request = (path = '', options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  try {
    assert.equal((await request()).headers.get('location'), '/platform/login');
    assert.equal((await request('/gyms/new')).headers.get('location'), '/platform/login');
    assert.equal((await request('/billing')).headers.get('location'), '/platform/login');
    assert.equal((await request('/gyms', { method: 'POST' })).headers.get('location'), '/platform/login');
    assert.equal(gymWrites, 0);
    assert.equal((await fetch(base.replace('/platform', '/register-gym'))).status, 404);
    assert.equal((await fetch(base.replace('/platform', '/register'), { method: 'POST' })).status, 404);
    const tenantToken = jwt.sign({ sub: 1, role: 'admin', gymId: 'some-gym' }, process.env.JWT_SECRET);
    assert.equal((await request('', { headers: { cookie: `fitnexis_platform=${tenantToken}` } })).headers.get('location'), '/platform/login');
    const login = await request('/login');
    assert.equal(login.headers.get('cache-control'), 'no-store');
    const csrfPair = login.headers.getSetCookie().find(value => value.startsWith('fitnexis_platform_csrf=')).split(';')[0];
    const csrf = csrfPair.split('=')[1];
    assert.ok((await login.text()).includes(csrf));
    const post = (path, body, cookie = csrfPair) => request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    assert.equal((await post('/login', { email: 'owner@example.invalid', password: 'test-password-123' })).status, 403);
    assert.equal((await post('/login', { _csrf: csrf, email: 'owner@example.invalid', password: 'wrong' })).status, 401);
    const signedIn = await post('/login', { _csrf: csrf, email: ' OWNER@example.invalid ', password: 'test-password-123' });
    assert.equal(signedIn.status, 302);
    const cookies = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const rotatedCsrf = signedIn.headers.getSetCookie().find(value => value.startsWith('fitnexis_platform_csrf=')).split(';')[0].split('=')[1];
    const dashboard = await request('', { headers: { cookie: cookies } });
    assert.equal(dashboard.status, 200);
    const html = await dashboard.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('/platform/gyms/new'));
    assert.ok(html.includes('/platform/billing'));
    const registration = await request('/gyms/new', { headers: { cookie: cookies } });
    assert.equal(registration.status, 200);
    assert.ok((await registration.text()).includes('name="gymMail"'));
    const billing = await request('/billing', { headers: { cookie: cookies } });
    assert.equal(billing.status, 200);
    assert.ok((await billing.text()).includes('Coming soon'));
    assert.equal((await post('/gyms', { ...gymInput, _csrf: 'wrong' }, cookies)).status, 403);
    assert.equal(gymWrites, 0);
    const invalid = await post('/gyms', { ...gymInput, _csrf: rotatedCsrf, email: 'invalid' }, cookies);
    assert.equal(invalid.status, 400);
    const invalidHtml = await invalid.text();
    assert.ok(invalidHtml.includes('value="New Gym"'));
    assert.ok(!invalidHtml.includes(gymInput.password));
    assert.equal(gymWrites, 0);
    const createdGym = await post('/gyms', { ...gymInput, _csrf: rotatedCsrf }, cookies);
    assert.equal(createdGym.status, 303);
    assert.equal(createdGym.headers.get('location'), '/platform?created=1#gyms');
    assert.equal(createdGym.headers.getSetCookie().length, 0, 'Creating a gym must not replace platform or gym login cookies');
    assert.equal(gymWrites, 1);
    duplicateGym = true;
    assert.equal((await post('/gyms', { ...gymInput, _csrf: rotatedCsrf }, cookies)).status, 409);
    assert.equal((await request('?created=1', { headers: { cookie: cookies } })).status, 200);
    disabled = true;
    assert.equal((await request('', { headers: { cookie: cookies } })).headers.get('location'), '/platform/login');
    disabled = false;
    assert.equal((await post('/logout', { _csrf: csrf }, cookies)).status, 403);
    assert.equal((await post('/logout', { _csrf: rotatedCsrf }, cookies)).status, 302);
    assert.equal(revoked, true);
    assert.equal((await request('', { headers: { cookie: cookies } })).headers.get('location'), '/platform/login');
    for (let i = 0; i < 10; i++) {
      assert.equal((await post('/login', { _csrf: csrf, email: 'nobody@example.invalid', password: 'wrong' })).status, 401);
    }
    assert.equal((await post('/login', { _csrf: csrf, email: 'nobody@example.invalid', password: 'wrong' })).status, 429);
  } finally {
    db.query = original;
    db.connect = originalConnect;
    if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
    await new Promise(resolve => server.close(resolve));
  }
});
