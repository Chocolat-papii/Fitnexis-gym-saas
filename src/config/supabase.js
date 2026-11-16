import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export function getSupabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (NEXT_PUBLIC_ aliases are also supported).');
  }
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('SUPABASE_URL must be an HTTP or HTTPS URL.');
  }
  if (!key.startsWith('sb_publishable_')) {
    throw new Error('Use a Supabase publishable key for this client.');
  }
  return { url, key };
}

// Create a separate client per request when supplying a Supabase user token.
// Fitnexis session JWTs are not Supabase access tokens.
export function createSupabaseClient({ accessToken, env = process.env, fetch } = {}) {
  const { url, key } = getSupabaseConfig(env);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { accessToken: async () => accessToken } : {}),
    ...(fetch ? { global: { fetch } } : {}),
  });
}
