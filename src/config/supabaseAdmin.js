import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Server only. Never pass this client or its secret key to browser code.
export function createSupabaseAdminClient({ env = process.env, fetch: request = globalThis.fetch } = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key?.startsWith('sb_secret_')) {
    throw Object.assign(new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY for photo storage.'), { status: 503 });
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, options = {}) => request(input, {
        ...options,
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      }),
    },
  });
}
