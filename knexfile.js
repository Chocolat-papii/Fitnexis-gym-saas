import 'dotenv/config';
import { getDatabaseConfig } from './src/config/database.js';

function config(environment) {
  return {
    client: 'pg',
    connection: getDatabaseConfig({ ...process.env, NODE_ENV: environment }),
    migrations: { directory: './migrations' },
  };
}

export default {
  development: config('development'),
  production: config('production'),
};
