import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailDelivery } from '../src/services/email.service.js';

const env = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'Fitnexis <no-reply@example.invalid>' };

test('verification emails use the Resend HTTPS API for login and identity confirmation', async () => {
  const requests = [];
  const delivery = createEmailDelivery({ env, fetch: async (url, options) => {
    requests.push({ url, ...options });
    return new Response(JSON.stringify({ id: 'email-id' }), { status: 200 });
  } });
  await delivery.sendCode('member@example.invalid', '123456', 'login');
  await delivery.sendCode('member@example.invalid', '654321', 'reauth');
  assert.ok(requests.every(r => r.url === 'https://api.resend.com/emails' && r.method === 'POST'));
  assert.equal(requests[0].headers.Authorization, 'Bearer re_test_key');
  const bodies = requests.map(r => JSON.parse(r.body));
  assert.deepEqual(bodies[0].to, ['member@example.invalid']);
  assert.equal(bodies[0].from, env.RESEND_FROM);
  assert.match(bodies[0].text, /sign-in code is 123456/);
  assert.match(bodies[1].text, /identity confirmation code is 654321/);
  assert.ok(requests.every(r => r.signal instanceof AbortSignal));
});

test('missing settings, quotas, provider errors, timeouts and malformed responses fail closed', async () => {
  await assert.rejects(createEmailDelivery({ env: {} }).sendCode('a@example.invalid', '123456'), { status: 503 });
  for (const fetch of [
    async () => new Response('sensitive provider response', { status: 429 }),
    async () => new Response('sensitive provider response', { status: 500 }),
    async () => new Response('{}', { status: 200 }),
    async () => { throw new Error('private provider detail'); },
  ]) {
    await assert.rejects(createEmailDelivery({ env, fetch }).sendCode('a@example.invalid', '123456'), error => {
      assert.equal(error.status, 503);
      assert.ok(!/sensitive|private|123456|re_test_key/.test(error.message));
      return true;
    });
  }
});
