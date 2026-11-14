import { db } from '../config/db.js';
import { billingError, positiveId } from './billing.service.js';

export async function createBooking(sessionId, userId, gymId) {
  if (!positiveId(sessionId) || !positiveId(userId)) throw billingError('Invalid session or member');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize reservations so the last place cannot be oversold.
    const { rows: [session] } = await client.query(`SELECT s.*,c.name AS class_name
      FROM class_sessions s JOIN class_types c ON c.id=s.class_type_id AND c.gym_id=s.gym_id
      WHERE s.id=$1 AND s.gym_id=$2 FOR UPDATE OF s`, [sessionId, gymId]);
    if (!session) throw billingError('Session not found', 404);
    const { rows: [member] } = await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role='member'", [userId, gymId]);
    if (!member) throw billingError('Member not found', 404);
    const { rows: [existing] } = await client.query('SELECT * FROM class_bookings WHERE session_id=$1 AND user_id=$2 AND gym_id=$3', [sessionId, userId, gymId]);
    if (existing && ['booked','awaiting_payment'].includes(existing.booking_status)) {
      await client.query('COMMIT');
      return { ...existing, already_booked: true };
    }
    if (existing) throw billingError('Contact your gym to restore this booking', 409);
    if (session.status !== 'scheduled' || new Date(session.starts_at) <= new Date()) throw billingError('This session is no longer available for booking', 409);
    const { rows: [reserved] } = await client.query(`SELECT COUNT(*)::int AS total FROM class_bookings
      WHERE session_id=$1 AND gym_id=$2 AND booking_status IN ('booked','awaiting_payment')`, [sessionId, gymId]);
    if (reserved.total >= session.capacity) throw billingError('This session is full', 409);
    let invoiceId = null;
    if (session.is_paid) {
      const when = new Date(session.starts_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
      const { rows: [invoice] } = await client.query(`INSERT INTO invoices(gym_id,user_id,amount,currency,status,due_at,description)
        VALUES($1,$2,$3,'ZAR','due',$4,$5) RETURNING id`, [gymId, userId, session.price, session.starts_at, 'Class session: ' + session.class_name + ' (' + when + ')']);
      invoiceId = invoice.id;
      await client.query('UPDATE invoices SET invoice_number=$1 WHERE id=$2 AND gym_id=$3', ['INV-' + String(invoiceId).padStart(8,'0'), invoiceId, gymId]);
    }
    const { rows: [booking] } = await client.query(`INSERT INTO class_bookings(session_id,user_id,gym_id,booking_status,invoice_id)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [sessionId, userId, gymId, session.is_paid ? 'awaiting_payment' : 'booked', invoiceId]);
    await client.query('COMMIT');
    return booking;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function getUserBookings(userId, gymId) {
  const { rows } = await db.query(`SELECT session_id,booking_status,invoice_id FROM class_bookings
    WHERE user_id=$1 AND gym_id=$2 AND booking_status IN ('booked','awaiting_payment')`, [userId, gymId]);
  return rows;
}
