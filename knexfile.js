import dotenv from "dotenv";
dotenv.config();

// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */


export default {
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    },
    migrations: {
      directory: "./migrations"
    }
  },

  production: {
    client: "pg",
    connection:  {
        connectionString: process.env.PROD_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      },
    migrations: {
      directory: "./migrations"
    }
  }
};
