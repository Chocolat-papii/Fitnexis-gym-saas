import { getSupabaseConfig } from '../src/config/supabase.js';

try {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase API returned HTTP ${response.status}.`);
  console.log('Supabase API connection and publishable key verified.');
  console.log('This check does not verify PostgreSQL credentials or migrate application data.');
} catch (error) {
  // Do not print request objects, credentials, or connection strings.
  console.error('Supabase check failed:', error.cause?.code || error.message);
  process.exitCode = 1;
}
