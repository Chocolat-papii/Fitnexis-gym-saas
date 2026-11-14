import bcrypt from 'bcrypt';
import { db } from '../config/db.js';
import {audit} from './audit.service.js';

export const gymFields = ['name', 'slug', 'gymMail', 'address', 'firstname', 'lastname', 'phone', 'email'];
export function gymFormValues(input = {}) {
  return Object.fromEntries(gymFields.map(key => [key, typeof input[key] === 'string' ? input[key].trim() : '']));
}

export async function createPlatformGym(input = {}, actor = {scope:'system'}, {pending=false,planId=null}={}) {
  if(pending&&input.authorized_owner!=='yes')throw Object.assign(new Error('Confirm that you are authorized to register this gym.'),{status:400});
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
    const { rows: [gym] } = await client.query(`INSERT INTO gyms(name,slug,email,address,account_status)
      VALUES($1,$2,$3,$4,$5) RETURNING id`, [values.name, values.slug, values.gymMail, values.address || null,pending?'pending':'active']);
    const {rows:[owner]}=await client.query(`INSERT INTO users(firstname,lastname,phone,email,password,role,gym_id)
      VALUES($1,$2,$3,$4,$5,'gym_super_admin',$6) RETURNING id`,
    [values.firstname, values.lastname, values.phone, values.email, hash, gym.id]);
    await client.query('UPDATE gyms SET owner_id=$2 WHERE id=$1',[gym.id,owner.id]);
    await client.query('INSERT INTO gym_subscriptions(gym_id) VALUES($1)',[gym.id]);
    if(planId){
      const {rows:[plan]}=await client.query('SELECT id FROM saas_plans WHERE id=$1 AND is_active=true',[planId]);
      if(!plan)throw Object.assign(new Error('Select an available subscription plan.'),{status:400});
      await client.query('UPDATE gym_subscriptions SET pending_plan_id=$2 WHERE gym_id=$1',[gym.id,plan.id]);
    }
    await audit(client,actor,'gym.created',gym.id,gym.id,{owner_id:owner.id,status:pending?'pending':'active'});
    await client.query('COMMIT');
    return gym;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw Object.assign(new Error('That gym slug or administrator account already exists. Choose a different slug.'), { status: 409 });
    throw error;
  } finally { client.release(); }
}
