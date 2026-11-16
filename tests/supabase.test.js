import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseClient, getSupabaseConfig } from '../src/config/supabase.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };

test('Supabase config supports existing env names and refuses privileged keys', () => {
  assert.deepEqual(getSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: env.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY }), { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY });
  assert.throws(() => getSupabaseConfig({}), /Set SUPABASE_URL/);
  assert.throws(() => getSupabaseConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }), /publishable key/);
});

test('Supabase requests isolate user access tokens and default to the public role', async () => {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push(new Headers(options.headers));
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const first = createSupabaseClient({ env, fetch, accessToken: 'user-one' });
  const second = createSupabaseClient({ env, fetch, accessToken: 'user-two' });
  const publicClient = createSupabaseClient({ env, fetch });
  for (const client of [first, second, publicClient]) {
    const { error } = await client.from('example').select('id');
    assert.equal(error, null);
  }
  assert.deepEqual(requests.map(headers => headers.get('authorization')), ['Bearer user-one', 'Bearer user-two', 'Bearer sb_publishable_test']);
  assert.ok(requests.every(headers => headers.get('apikey') === env.SUPABASE_PUBLISHABLE_KEY));
});
