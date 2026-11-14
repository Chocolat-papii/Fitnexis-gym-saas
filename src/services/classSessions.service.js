import { db } from '../config/db.js';
import { amountValue, billingError, positiveId, cents } from './billing.service.js';
const historySession=session=>['completed','cancelled'].includes(session.status)||new Date(session.ends_at||session.starts_at)<=new Date();

async function sessionValues(client, data, gymId) {
  const classId = positiveId(data.class_type_id);
  const { rows: [type] } = await client.query('SELECT id,default_duration_minutes FROM class_types WHERE id=$1 AND gym_id=$2', [classId, gymId]);
  if (!type) throw billingError('Class type not found', 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '') || !/^\d{2}:\d{2}(?::\d{2})?$/.test(data.time || '')) throw billingError('Valid date and time are required');
  const start = new Date(data.date + 'T' + data.time + '+02:00');
  if (!Number.isFinite(start.getTime()) || new Date(start.getTime() + 7200000).toISOString().slice(0, 10) !== data.date) throw billingError('Invalid session date or time');
  const capacity = Number(data.capacity ?? 20);
  const duration = Number(data.duration || type.default_duration_minutes || 60);
  const deadline = Number(data.cancellation_deadline_hours ?? 24);
  const status = String(data.status || 'scheduled').toLowerCase();
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000) throw billingError('Capacity must be a positive whole number');
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 1440) throw billingError('Duration must be between 1 and 1440 minutes');
  if (!Number.isSafeInteger(deadline) || deadline < 0 || deadline > 8760) throw billingError('Invalid cancellation deadline');
  if (!['scheduled', 'cancelled', 'completed'].includes(status)) throw billingError('Invalid session status');
  if (data.is_paid !== undefined && typeof data.is_paid !== 'boolean') throw billingError('Paid session must be true or false');
  const paid = data.is_paid ?? false;
  const price = paid ? amountValue(data.price) : '0.00';
  if (paid && cents(price) < 100) throw billingError('Paid sessions must cost at least R1');
  const trainer = data.trainer_id ? positiveId(data.trainer_id) : null;
  if (data.trainer_id) {
    const { rows: [user] } = await client.query('SELECT id FROM users WHERE id=$1 AND gym_id=$2', [trainer, gymId]);
    if (!user) throw billingError('Trainer not found', 404);
  }
  return [type.id, trainer, data.time, start, new Date(start.getTime() + duration * 60000), capacity,
    String(data.location || '').trim().slice(0, 255), status, data.waitlist_enabled === true, deadline, gymId, paid, price, data.branch_id ? positiveId(data.branch_id) : null];
}

export async function createClassSession(data, gymId) {
  const values = await sessionValues(db, data, gymId);
  const { rows: [session] } = await db.query(`INSERT INTO class_sessions
    (class_type_id,trainer_id,start_time,starts_at,ends_at,capacity,location,status,waitlist_enabled,cancellation_deadline_hours,gym_id,is_paid,price,branch_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, values);
  return session;
}

export async function getAllSessions(gymId, staffId=null) {
  const { rows } = await db.query(`SELECT s.*,c.name AS class_name,c.description,
    EXTRACT(EPOCH FROM (s.ends_at-s.starts_at))/60 AS default_duration_minutes,
    (SELECT COUNT(*)::int FROM class_bookings b WHERE b.session_id=s.id AND b.gym_id=s.gym_id
      AND b.booking_status IN ('booked','awaiting_payment')) AS booking_count
    FROM class_sessions s JOIN class_types c ON c.id=s.class_type_id AND c.gym_id=s.gym_id
    WHERE s.gym_id=$1 AND ($2::int IS NULL OR s.branch_id IS NULL OR EXISTS(SELECT 1 FROM staff_branch_access a WHERE a.user_id=$2 AND a.branch_id=s.branch_id AND a.gym_id=s.gym_id)) ORDER BY s.starts_at`, [gymId,staffId]);
  return rows;
}

export async function getUpcomingSessions(gymId) {
  const { rows } = await db.query(`SELECT s.*,c.name AS class_name,c.description,
    to_char(s.starts_at AT TIME ZONE 'Africa/Johannesburg','DD Mon') AS class_date,
    to_char(s.starts_at AT TIME ZONE 'Africa/Johannesburg','HH24:MI') AS class_time
    FROM class_sessions s JOIN class_types c ON c.id=s.class_type_id AND c.gym_id=s.gym_id
    WHERE s.gym_id=$1 AND s.starts_at>=NOW() AND s.status='scheduled' ORDER BY s.starts_at LIMIT 5`, [gymId]);
  return rows;
}

export async function updateSession(id, data, gymId) {
  if (!positiveId(id)) throw billingError('Invalid session');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [current] } = await client.query('SELECT * FROM class_sessions WHERE id=$1 AND gym_id=$2 FOR UPDATE', [id, gymId]);
    if (!current) { await client.query('COMMIT'); return undefined; }
    if(historySession(current))throw billingError('Session history is read-only',409);
    const values = await sessionValues(client, { ...data, trainer_id: data.trainer_id === undefined ? current.trainer_id : data.trainer_id,
      branch_id: data.branch_id === undefined ? current.branch_id : data.branch_id, is_paid: data.is_paid ?? current.is_paid, price: data.price ?? current.price }, gymId);
    const { rows: [counts] } = await client.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE booking_status IN ('booked','awaiting_payment'))::int AS reserved
      FROM class_bookings WHERE session_id=$1 AND gym_id=$2`, [id, gymId]);
    if (counts.total && (values[11] !== current.is_paid || cents(values[12]) !== cents(current.price))) throw billingError('Payment terms cannot change after bookings exist. Create a new session instead', 409);
    if (values[5] < counts.reserved) throw billingError('Capacity cannot be lower than the number of reserved places', 409);
    if (counts.reserved && current.is_paid && values[7] === 'cancelled') throw billingError('Resolve paid-session bookings and any refunds before cancelling this session', 409);
    const { rows: [session] } = await client.query(`UPDATE class_sessions SET
      class_type_id=$1,trainer_id=$2,start_time=$3,starts_at=$4,ends_at=$5,capacity=$6,location=$7,status=$8,
      waitlist_enabled=$9,cancellation_deadline_hours=$10,is_paid=$12,price=$13,branch_id=$14,updated_at=NOW()
      WHERE id=$15 AND gym_id=$11 RETURNING *`, [...values, id]);
    await client.query('COMMIT');
    return session;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function deleteSession(id, gymId) {
  if (!positiveId(id)) throw billingError('Invalid session');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [session] } = await client.query('SELECT id,starts_at,ends_at,status FROM class_sessions WHERE id=$1 AND gym_id=$2 FOR UPDATE', [id, gymId]);
    if (!session) { await client.query('COMMIT'); return 0; }
    if(historySession(session))throw billingError('Session history is read-only',409);
    const { rows: [booking] } = await client.query('SELECT id FROM class_bookings WHERE session_id=$1 AND gym_id=$2 LIMIT 1', [id, gymId]);
    if (booking) throw billingError('Sessions with bookings cannot be deleted. Booking and payment history must be retained', 409);
    const { rowCount } = await client.query('DELETE FROM class_sessions WHERE id=$1 AND gym_id=$2', [id, gymId]);
    await client.query('COMMIT');
    return rowCount;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
