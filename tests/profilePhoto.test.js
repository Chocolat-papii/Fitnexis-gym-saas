import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { db } from '../src/config/db.js';
import memberRoutes from '../src/routes/dashboardPageRoutes.js';
import { createProfilePhotoStorage, profilePhotoStorage, profilePhotoUrl, MAX_PHOTO_BYTES } from '../src/services/profilePhoto.service.js';

const gym = '11111111-1111-4111-8111-111111111111';
const otherGym = '22222222-2222-4222-8222-222222222222';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhS8AAAAASUVORK5CYII=', 'base64');
const previous = `supabase://fitnexis-profile-photos/${gym}/7/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;

test('storage scopes keys, rejects invalid bytes and MIME types, and refuses signing or deleting another owner', async () => {
  const calls = [];
  const service = createProfilePhotoStorage({ client: { storage: { from: bucket => {
    assert.equal(bucket, 'fitnexis-profile-photos');
    return {
      upload: async (path, bytes, options) => { calls.push({ path, bytes, options }); return { error: null }; },
      createSignedUrl: async (path, expiry) => { calls.push({ path, expiry }); return { data: { signedUrl: 'https://example.invalid/signed' } }; },
      remove: async paths => { calls.push({ paths }); return { error: null }; },
    };
  } } } });
  const reference = await service.upload({ buffer: png, mimetype: 'image/png' }, gym, 7);
  assert.match(reference, new RegExp(`^supabase://fitnexis-profile-photos/${gym}/7/[a-f0-9-]+\\.png$`));
  assert.equal(calls[0].options.upsert, false);
  assert.equal(calls[0].options.contentType, 'image/png');
  assert.match(profilePhotoUrl(reference, 7), /^\/member\/profile-photo\/7\?v=/);
  assert.equal(await service.signedUrl(reference, gym, 7), 'https://example.invalid/signed');
  assert.equal(calls[1].expiry, 60);
  const before = calls.length;
  await assert.rejects(service.signedUrl(reference, otherGym, 7), { status: 404 });
  await assert.rejects(service.remove(reference, gym, 8), { status: 404 });
  await assert.rejects(service.signedUrl(`supabase://fitnexis-profile-photos/${gym}/7/../8/test.png`, gym, 7), { status: 404 });
  await assert.rejects(service.upload({ buffer: Buffer.from('<svg/>'), mimetype: 'image/png' }, gym, 7), { status: 400 });
  await assert.rejects(service.upload({ buffer: png, mimetype: 'image/jpeg' }, gym, 7), { status: 400 });
  await assert.rejects(service.upload({ buffer: Buffer.alloc(MAX_PHOTO_BYTES + 1), mimetype: 'image/png' }, gym, 7), { status: 400 });
  assert.equal(calls.length, before);
  await service.remove(reference, gym, 7);
  assert.deepEqual(calls.at(-1).paths, [reference.replace('supabase://fitnexis-profile-photos/', '')]);
});

test('profile routes require authentication, validate uploads, save scoped references and clean up failed replacements', async () => {
  const original = { query: db.query, connect: db.connect, ...profilePhotoStorage, secret: process.env.JWT_SECRET };
  process.env.JWT_SECRET = 'profile-photo-test-only';
  const statements = [], removed = [];
  let uploads = 0, signed = 0, failSave = false, failStorage = false, role = 'member';
  const uploaded = `supabase://fitnexis-profile-photos/${gym}/7/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`;
  const query = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes('JOIN gym_auth_sessions')) return { rows: [{ id: 7, role, auth_version: 1, gym_id: gym, mfa_verified: true }] };
    if (sql.startsWith('SELECT id FROM users')) { assert.deepEqual(params, ['7', gym]); return { rows: [{ id: 7 }] }; }
    if (sql.startsWith('SELECT profile_picture')) { assert.equal(params[1], gym); return { rows: [{ profile_picture: previous }] }; }
    if (sql.includes('INSERT INTO public.member_profile')) {
      assert.equal(params[0], '7'); assert.equal(params[7], gym);
      if (failSave) throw new Error('database failure');
    }
    return { rows: [], rowCount: 1 };
  };
  db.query = query;
  db.connect = async () => ({ query, release() {} });
  profilePhotoStorage.upload = async (file, g, u) => {
    uploads++; assert.equal(g, gym); assert.equal(u, '7');
    // Use the real validator before returning a fake provider result.
    const fake = createProfilePhotoStorage({ client: { storage: { from: () => ({ upload: async () => ({ error: null }) }) } } });
    await fake.upload(file, g, u);
    if (failStorage) throw Object.assign(new Error('Photo storage unavailable.'), { status: 503 });
    return uploaded;
  };
  profilePhotoStorage.remove = async (ref, g, u) => { assert.equal(g, gym); assert.equal(u, '7'); removed.push(ref); };
  profilePhotoStorage.signedUrl = async (ref, g, u) => { signed++; assert.equal(g, gym); assert.equal(u, '7'); return 'https://example.invalid/signed'; };
  const app = express();
  app.use(cookieParser());
  app.use((req, res, next) => { req.gymId = gym; next(); });
  app.use('/member', memberRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({ sub: '7', gymId: gym, version: 1, jti: 'session' }, process.env.JWT_SECRET, { audience: 'fitnexis-gym', issuer: 'fitnexis' });
  const headers = { cookie: `token=${token}` };
  const form = (bytes = png, type = 'image/png') => { const body = new FormData(); body.set('display_name', 'Member'); if (bytes) body.set('profile_picture', new Blob([bytes], { type }), 'photo.png'); return body; };
  const post = (body, extra = {}) => fetch(base + '/member/member-profile-update', { method: 'POST', headers: { ...headers, ...extra }, body });
  try {
    assert.equal((await fetch(base + '/member/member-profile-update', { method: 'POST', body: form() })).status, 401);
    assert.equal(uploads, 0);
    assert.equal((await post(form(), { origin: 'https://foreign.example' })).status, 403);
    assert.equal(uploads, 0);
    const saved = await post(form());
    assert.equal(saved.status, 200); assert.match((await saved.json()).profile_picture, /^\/member\/profile-photo\/7/);
    assert.deepEqual(removed, [previous]);
    assert.ok(statements.some(s => s.sql === 'COMMIT'));
    failSave = true;
    assert.equal((await post(form())).status, 500);
    assert.equal(removed.at(-1), uploaded);
    assert.ok(statements.some(s => s.sql === 'ROLLBACK'));
    failSave = false; failStorage = true;
    const writes = statements.filter(s => s.sql.includes('INSERT INTO public.member_profile')).length;
    assert.equal((await post(form())).status, 503);
    assert.equal(statements.filter(s => s.sql.includes('INSERT INTO public.member_profile')).length, writes);
    failStorage = false;
    assert.equal((await post(form(Buffer.alloc(MAX_PHOTO_BYTES + 1)))).status, 413);
    assert.equal((await post(form(Buffer.from('<svg/>'), 'image/svg+xml'))).status, 400);
    assert.equal((await post(form(Buffer.from('not an image')))).status, 400);
    const count = uploads;
    assert.equal((await post(form(null))).status, 200);
    assert.equal(uploads, count);
    assert.equal(statements.filter(s => s.sql.includes('INSERT INTO public.member_profile')).at(-1).params[1], null);
    assert.equal((await fetch(base + '/member/profile-photo/7', { redirect: 'manual' })).status, 401);
    assert.equal((await fetch(base + '/member/profile-photo/8', { headers, redirect: 'manual' })).status, 403);
    assert.equal(signed, 0);
    const photo = await fetch(base + '/member/profile-photo/7', { headers, redirect: 'manual' });
    assert.equal(photo.status, 302); assert.equal(photo.headers.get('location'), 'https://example.invalid/signed');
    assert.equal(photo.headers.get('cache-control'), 'private, no-store');
    assert.equal(signed, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.query = original.query; db.connect = original.connect;
    for (const name of ['upload', 'remove', 'signedUrl']) profilePhotoStorage[name] = original[name];
    if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  }
});
