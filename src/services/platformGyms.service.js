import bcrypt from 'bcrypt';
import { db } from '../config/db.js';

export const gymFields = ['name', 'slug', 'gymMail', 'address', 'firstname', 'lastname', 'phone', 'email'];
export function gymFormValues(input = {}) {
  return Object.fromEntries(gymFields.map(key => [key, typeof input[key] === 'string' ? input[key].trim() : '']));
}

export async function createPlatformGym(input = {}) {
  const values = gymFormValues(input);
  values.slug = values.slug.toLowerCase();
  values.email = values.email.toLowerCase();
  values.gymMail = values.gymMail.toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  for (const [key, max] of Object.entries({ name: 150, slug: 63, firstname: 100, lastname: 100, phone: 50, email: 255, gymMail: 255 })) {
    if (!values[key] || values[key].length > max) fail('Complete all required fields within their length limits.');
  }
  if (values.address.length > 2000) fail('The address must be 2,000 characters or fewer.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug) ||
      ['www', 'fitnexis', 'admin', 'platform', 'api', 'assets', 'localhost'].includes(values.slug)) {
    fail('Choose a gym slug using lowercase letters, numbers and single hyphens. This slug must not be a reserved name.');
  }
  if (![values.email, values.gymMail].every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    fail('Enter valid gym and administrator email addresses.');
  }
  if (password.length < 12 || Buffer.byteLength(password) > 72) {
    fail('Use an administrator password of at least 12 characters and no more than 72 UTF-8 bytes.');
  }
  const hash = await bcrypt.hash(password, 12);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [gym] } = await client.query(`INSERT INTO gyms(name,slug,email,address)
      VALUES($1,$2,$3,$4) RETURNING id`, [values.name, values.slug, values.gymMail, values.address || null]);
    await client.query(`INSERT INTO users(firstname,lastname,phone,email,password,role,gym_id)
      VALUES($1,$2,$3,$4,$5,'admin',$6)`,
    [values.firstname, values.lastname, values.phone, values.email, hash, gym.id]);
    await client.query('COMMIT');
    return gym;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw Object.assign(new Error('That gym slug or administrator account already exists. Choose a different slug.'), { status: 409 });
    throw error;
  } finally { client.release(); }
}
