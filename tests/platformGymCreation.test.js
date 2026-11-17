import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { db } from '../src/config/db.js';
import router from '../src/routes/platform.routes.js';
import { emailDelivery } from '../src/services/email.service.js';

test('a fresh platform session can confirm identity in the gym form and create a gym without losing its draft', async () => {
  const previous = { query: db.query, connect: db.connect, send: emailDelivery.sendCode, secret: process.env.JWT_SECRET };
  process.env.JWT_SECRET = 'platform-gym-regression-test-only';
  const actor = { id: 1, name: 'Owner', email: 'owner@example.invalid', role: 'fitnexis_super_admin', password: await bcrypt.hash('platform-password-123', 4) };
  let confirmedUntil = null, challenge, code, gymWrites = 0;
  const query = async (sql, params = []) => {
    if (sql.includes('s.id=$1')) return { rows: [{ ...actor, session_id: 'session', reauth_until: confirmedUntil }] };
    if (sql.startsWith('SELECT * FROM platform_admins')) return { rows: [actor] };
    if (sql.includes("method='email' AND expires_at>")) return { rows: [] };
    if (sql.startsWith('INSERT INTO mfa_challenges')) {
      challenge = { id: params[0], scope: params[1], actor_id: params[2], gym_id: params[3], secret: params[4], purpose: params[5], email: params[6], attempts: 0, expires_at: new Date(Date.now() + 300000) };
    }
    if (sql.includes('FROM mfa_challenges') && sql.includes('FOR UPDATE')) return { rows: [challenge] };
    if (sql.includes('FROM mfa_challenges')) return { rows: challenge && !challenge.used_at && params[0] === challenge.id ? [challenge] : [] };
    if (sql.startsWith('UPDATE mfa_challenges SET attempts')) { challenge.attempts++; return { rows: [{ id: challenge.id }] }; }
    if (sql.startsWith('UPDATE mfa_challenges SET used_at') && params.length === 1) challenge.used_at = new Date();
    if (sql.startsWith('UPDATE platform_sessions SET reauth_until')) { confirmedUntil = new Date(Date.now() + 300000); return { rows: [{ reauth_until: confirmedUntil }] }; }
    if (sql.includes('INSERT INTO gyms')) { gymWrites++; return { rows: [{ id: 'new-gym' }] }; }
    if (sql.includes('INSERT INTO users')) return { rows: [{ id: 7 }] };
    return { rows: [], rowCount: 1 };
  };
  db.query = query; db.connect = async () => ({ query, release() {} });
  emailDelivery.sendCode = async (email, value, purpose) => { assert.equal(email, actor.email); assert.equal(purpose, 'reauth'); code = value; };
  const app = express(); app.engine('html', ejs.renderFile); app.set('view engine', 'html');
  app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
  app.use(cookieParser(), express.json(), express.urlencoded({ extended: false }), router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({}, process.env.JWT_SECRET, { audience: 'fitnexis-platform', issuer: 'fitnexis', subject: '1', jwtid: 'session' });
  const sessionCookie = `fitnexis_platform=${token}`;
  const input = { name: 'Draft Gym', slug: 'draft-gym', gymMail: 'contact@example.invalid', address: '123 Main Road', firstname: 'Gym', lastname: 'Owner', phone: '0123456789', email: 'gym-owner@example.invalid', password: 'gym-password-123' };
  try {
    const page = await fetch(base + '/gyms/new', { headers: { cookie: sessionCookie } });
    assert.equal(page.status, 200);
    const csrfPair = page.headers.getSetCookie().find(c => c.startsWith('fitnexis_platform_csrf=')).split(';')[0];
    const csrf = csrfPair.split('=')[1];
    let cookies = sessionCookie + '; ' + csrfPair;
    const post = (url, body, json = false) => fetch(base + url, { method: 'POST', redirect: 'manual', headers: { cookie: cookies, 'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded' }, body: json ? JSON.stringify({ ...body, _csrf: csrf }) : new URLSearchParams({ ...body, _csrf: csrf }) });
    const pageHtml = await page.text();
    assert.match(pageHtml, /platformGymForm\.js/);
    assert.match(pageHtml, /data-reauth-until="0"/);
    const blocked = await post('/gyms', input);
    assert.equal(blocked.status, 428);
    const draft = await blocked.text();
    assert.match(draft, /value="Draft Gym"/); assert.match(draft, /123 Main Road/);
    assert.match(draft, /Your gym details have been kept/);
    assert.ok(!draft.includes(input.password));
    assert.match(draft, /name="return_to" value="\/platform\/gyms\/new"/);
    assert.equal(gymWrites, 0);
    assert.equal((await post('/gyms', input, true)).status, 428);
    const nativeCode = await post('/reauthenticate/code', { return_to: '/platform/gyms/new' });
    assert.equal(nativeCode.headers.get('location'), '/platform/gyms/new?code=sent');
    const sent = await post('/reauthenticate/code', { return_to: '/platform/gyms/new' }, true);
    assert.equal(sent.status, 200); assert.equal((await sent.json()).ok, true);
    const challengeCookie = sent.headers.getSetCookie().find(c => c.startsWith('fitnexis_mfa_platform-reauth=')).split(';')[0];
    cookies += '; ' + challengeCookie;
    assert.equal((await post('/reauthenticate', { password: 'wrong', code }, true)).status, 401);
    assert.equal(gymWrites, 0);
    const confirmed = await post('/reauthenticate', { password: 'platform-password-123', code }, true);
    assert.equal(confirmed.status, 200); assert.ok((await confirmed.json()).reauthUntil > Date.now());
    const created = await post('/gyms', input);
    assert.equal(created.status, 303); assert.equal(created.headers.get('location'), '/platform?created=1#gyms');
    assert.equal(gymWrites, 1);
    confirmedUntil = new Date(Date.now() - 1);
    assert.equal((await post('/gyms', input)).status, 428); assert.equal(gymWrites, 1);
    const outside = await post('/reauthenticate/code', { return_to: 'https://evil.example' });
    assert.equal(outside.headers.get('location'), '/platform/billing?code=sent');
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    db.query = previous.query; db.connect = previous.connect; emailDelivery.sendCode = previous.send;
    if (previous.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous.secret;
  }
});

test('the gym form confirms identity without navigating away or clearing gym fields, and blocks expired confirmation', async () => {
  const gymFields = { name: 'Draft Gym', email: 'owner@example.invalid', password: 'private-gym-password' };
  const createButton = { textContent: 'Create gym and administrator', disabled: false, classList: { add() {}, remove() {} } };
  const gymForm = { fields: gymFields, dataset: { reauthUntil: '0' }, querySelector: () => createButton, setAttribute() {}, removeAttribute() {}, addEventListener: (event, fn) => { gymForm.submit = fn; }, reset() { for (const key of Object.keys(gymFields)) gymFields[key] = ''; } };
  const status = { textContent: '' };
  const gymStatus = { textContent: '' };
  const window = { addEventListener: (event, fn) => { window[event] = fn; } };
  const forms = ['code', 'confirm'].map(action => {
    const button = { disabled: false, textContent: action, focus() {} };
    const form = { action: '/platform/reauthenticate' + (action === 'code' ? '/code' : ''), dataset: { reauthAction: action }, fields: { _csrf: 'csrf', return_to: '/platform/gyms/new', ...(action === 'confirm' ? { password: 'platform-password', code: '123456' } : {}) }, querySelector: () => button, reset() { this.wasReset = true; }, addEventListener(event, fn) { this.submit = fn; } };
    return form;
  });
  const confirmation = { open: false, querySelectorAll: () => forms, querySelector: () => ({ focus() {} }), scrollIntoView() {} };
  let now = 1000;
  const requests = [];
  const context = vm.createContext({
    document: { querySelector: selector => ({ '[data-gym-form]': gymForm, '[data-platform-reauth]': confirmation, '[data-reauth-status]': status, '[data-gym-status]': gymStatus })[selector] },
    window,
    Date: { now: () => now },
    AbortSignal,
    FormData: class { constructor(form) { this.entries = Object.entries(form.fields); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } },
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true, reauthUntil: 2000, message: 'Confirmed' }) }; },
  });
  vm.runInContext(fs.readFileSync(new URL('../src/views/assets/dashboard/js/platformGymForm.js', import.meta.url), 'utf8'), context);
  let prevented = false;
  gymForm.submit({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  await forms[0].submit({ preventDefault() {} });
  await forms[1].submit({ preventDefault() {} });
  assert.deepEqual(gymFields, { name: 'Draft Gym', email: 'owner@example.invalid', password: 'private-gym-password' });
  assert.equal(forms[1].wasReset, true);
  assert.ok(!JSON.stringify(requests).includes('private-gym-password'));
  prevented = false; gymForm.submit({ preventDefault() { prevented = true; } }); assert.equal(prevented, false);
  assert.equal(createButton.disabled, true); assert.match(createButton.textContent, /Creating gym/);
  assert.match(gymStatus.textContent, /Please wait/);
  gymForm.submit({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  window.pageshow(); assert.equal(createButton.disabled, false);
  assert.equal(createButton.textContent, 'Create gym and administrator');
  now = 3000; gymForm.submit({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
});
