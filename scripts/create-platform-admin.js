import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from '../src/config/db.js';

try {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME?.trim() || 'Fitnexis Admin';
  if (!email || !password || password.length < 12 || Buffer.byteLength(password) > 72) {
    throw new Error('Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (12 characters minimum, 72 bytes maximum).');
  }
  const hash = await bcrypt.hash(password, 12);
  const result = await db.query(`INSERT INTO platform_admins(email,name,password,role) SELECT $1,$2,$3,CASE WHEN EXISTS(SELECT 1 FROM platform_admins) THEN 'fitnexis_admin' ELSE 'fitnexis_super_admin' END
    ON CONFLICT(email) DO NOTHING RETURNING id`, [email, name, hash]);
  console.log(result.rowCount ? 'Platform admin created.' : 'Platform admin already exists; credentials unchanged.');
} catch (err) {
  console.error(err.code ? `Could not create platform admin (${err.code}). Run migrations first.` : err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
