import 'dotenv/config';
import knex from 'knex';
import { getDatabaseConfig } from '../src/config/database.js';

// Bootstrap only: refuse existing tables instead of changing an existing database.
// Keep the schema creation and access restrictions in one transaction.
let database;
try {
  if (!process.env.SUPABASE_DATABASE_URL) throw new Error('Set SUPABASE_DATABASE_URL first.');
  database = knex({
    client: 'pg',
    connection: { ...getDatabaseConfig(), connectionTimeoutMillis: 10000 },
    pool: { min: 0, max: 1 },
    migrations: { directory: './migrations' },
  });
  await database.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext('fitnexis_supabase_initial_setup'))");
    const existing = await trx.raw(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    `);
    if (existing.rows.length) throw new Error('Setup refused: public schema already contains tables or views.');
    const role = await trx.raw('SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user');
    if (!role.rows[0]?.rolbypassrls) throw new Error('Setup requires the trusted backend database role.');

    const [, applied] = await trx.migrate.latest();
    const tables = await trx.raw(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
    `);
    for (const { relname } of tables.rows) {
      await trx.raw('ALTER TABLE ??.?? ENABLE ROW LEVEL SECURITY', ['public', relname]);
      await trx.raw('REVOKE ALL ON TABLE ??.?? FROM PUBLIC, anon, authenticated', ['public', relname]);
    }
    const sequences = await trx.raw(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S'
    `);
    for (const { relname } of sequences.rows) {
      await trx.raw('REVOKE ALL ON SEQUENCE ??.?? FROM PUBLIC, anon, authenticated', ['public', relname]);
    }
    for (const name of ['fitnexis_audit_immutable', 'fitnexis_reset_email_verification']) {
      await trx.raw("ALTER FUNCTION public.??() SET search_path TO ''", [name]);
      await trx.raw('REVOKE ALL ON FUNCTION public.??() FROM PUBLIC, anon, authenticated', [name]);
    }
    console.log(`Prepared ${applied.length} migrations and protected ${tables.rows.length} tables.`);
  });
  console.log('Supabase application schema committed. Existing local/AWS data was not copied.');
} catch (error) {
  console.error('Supabase setup failed:', error.code || (database ? 'Schema initialization rolled back; check schema prerequisites.' : error.message));
  process.exitCode = 1;
} finally {
  if (database) await database.destroy();
}
