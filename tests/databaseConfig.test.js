import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { getDatabaseConfig } from '../src/config/database.js';

test('Supabase overrides local and production databases and enforces TLS verification', () => {
  for (const NODE_ENV of ['development', 'production']) {
    const config = getDatabaseConfig({
      NODE_ENV,
      SUPABASE_DATABASE_URL: 'postgresql://postgres:password@db.example.supabase.co:5432/postgres?sslmode=no-verify',
      DB_HOST: 'localhost',
      PROD_DATABASE_URL: 'postgres://legacy.example/app',
    });
    const client = new pg.Client(config);
    assert.equal(client.connectionParameters.host, 'db.example.supabase.co');
    assert.notEqual(client.connectionParameters.ssl, false);
    assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized, false);
    assert.equal(new URL(config.connectionString).searchParams.get('sslmode'), 'verify-full');
  }
});

test('existing databases remain available until Supabase is configured', () => {
  const env = { DB_HOST: 'localhost', DB_USER: 'dev', DB_PASSWORD: 'test', DB_NAME: 'app', DB_PORT: '5432' };
  assert.equal(getDatabaseConfig(env).host, 'localhost');
  assert.equal(getDatabaseConfig(env).ssl, false);
  assert.equal(getDatabaseConfig({ NODE_ENV: 'production', PROD_DATABASE_URL: 'postgres://production/app', DATABASE_URL: 'postgres://fallback/app' }).connectionString, 'postgres://production/app');
  assert.equal(getDatabaseConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://fallback/app' }).connectionString, 'postgres://fallback/app');
  assert.throws(() => getDatabaseConfig({ SUPABASE_DATABASE_URL: 'https://example.com' }), /must use postgres/);
  assert.throws(() => getDatabaseConfig({ SUPABASE_DATABASE_URL: 'bad-secret-value' }), error => !error.message.includes('bad-secret-value'));
});
