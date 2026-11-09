import dotenv from "dotenv";
import pkg from "pg";
const { Pool } = pkg;

dotenv.config();


const isProd = process.env.NODE_ENV === "production";

export const db = new Pool(
  isProd
    ? {
        connectionString: process.env.PROD_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: false,
      }
);

export async function connectDB() {
  await db.query('SELECT 1');
  console.log("✅ Connected to PostgreSQL 2026");
}
