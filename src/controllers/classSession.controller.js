import { db } from "../config/db.js";

export const getSessions = async (req, res) => {

  const user_id = req.user?.sub || null;
  const gymId = req.gymId;

  const result = await db.query(`
    SELECT 
      s.id,
      s.starts_at,
      TO_CHAR(s.starts_at AT TIME ZONE 'Africa/Johannesburg','HH24:MI') AS time,
      TRIM(TO_CHAR(s.starts_at AT TIME ZONE 'Africa/Johannesburg','Day')) AS day,
      s.capacity,
      s.location,
      s.gym_id,
      s.is_paid,
      s.price,
      c.name AS class_name,
      COALESCE(b.booking_status='booked',false) AS enrolled,
      b.booking_status,
      b.invoice_id
    FROM class_sessions s
    JOIN class_types c 
    ON s.class_type_id = c.id
    AND c.gym_id = $2
    LEFT JOIN class_bookings b 
      ON b.session_id = s.id
      AND b.user_id = $1::int
      AND b.gym_id = $2
      WHERE s.gym_id = $2
      AND s.status='scheduled' AND s.starts_at>NOW()
    ORDER BY s.starts_at
  `,[user_id, gymId]);

  if (!user_id) {
  result.rows.forEach(s => s.location = null);
  }

  res.json(result.rows);

};
