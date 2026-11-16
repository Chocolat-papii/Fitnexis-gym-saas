import dotenv from "dotenv";
import pkg from "pg";
import { getDatabaseConfig } from "./database.js";
const { Pool } = pkg;

dotenv.config();


export const db = new Pool(getDatabaseConfig());

export async function connectDB() {
  await db.query('SELECT 1');
  console.log("✅ Connected to PostgreSQL 2026");
}
