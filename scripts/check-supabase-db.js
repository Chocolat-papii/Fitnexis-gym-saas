import 'dotenv/config';
import pg from 'pg';
import { getDatabaseConfig } from '../src/config/database.js';

let client;
try {
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error('Set SUPABASE_DATABASE_URL in your local .env using the PostgreSQL connection string from Supabase Connect.');
  }
  client = new pg.Client({ ...getDatabaseConfig(), connectionTimeoutMillis: 10000, query_timeout: 10000 });
  await client.connect();
  await client.query('SELECT 1');
  console.log('Supabase PostgreSQL connection verified with SELECT 1.');
  const { rows } = await client.query(`
    SELECT to_regclass('public.gyms') IS NOT NULL AS gyms,
           to_regclass('public.users') IS NOT NULL AS users,
           to_regclass('public.knex_migrations') IS NOT NULL AS migrations
  `);
  console.log('Application schema:', rows[0]);
  if (!rows[0].gyms || !rows[0].users || !rows[0].migrations) {
    console.error('Application schema is incomplete. Review migrations and Data API access before starting the app.');
    process.exitCode = 1;
  }
} catch (error) {
  // Driver messages can contain connection details. Log codes only.
  console.error('Supabase PostgreSQL check failed:', client ? (error.code || 'CONNECTION_OR_QUERY_FAILED') : error.message);
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
