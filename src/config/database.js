// Shared by the application pool and Knex so migrations target the same database.
export function getDatabaseConfig(env = process.env) {
  if (env.SUPABASE_DATABASE_URL) {
    let url;
    try {
      url = new URL(env.SUPABASE_DATABASE_URL);
    } catch {
      throw new Error('SUPABASE_DATABASE_URL must be a PostgreSQL connection string.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('SUPABASE_DATABASE_URL must use postgres:// or postgresql://.');
    }
    // pg reads TLS options from the URL. Enforce certificate and hostname verification.
    url.searchParams.set('sslmode', 'verify-full');
    return { connectionString: url.toString() };
  }
  if (env.NODE_ENV === 'production') {
    return {
      connectionString: env.PROD_DATABASE_URL || env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    user: env.DB_USER,
    host: env.DB_HOST,
    database: env.DB_NAME,
    password: env.DB_PASSWORD,
    port: env.DB_PORT,
    ssl: false,
  };
}
