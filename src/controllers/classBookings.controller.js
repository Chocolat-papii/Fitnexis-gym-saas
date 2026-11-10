import { db } from "../config/db.js";
import * as bookingService from "../services/classBooking.service.js";

export const createBooking = async (req, res) => {

  try {

    const { session_id } = req.body;
    const user_id = req.user?.sub;
    const gymId = req.gymId;

    if (!user_id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const booking = await bookingService.createBooking(session_id, user_id, gymId);

    res.json({
      ok: true,
      success: true,
      booking,
      payment_required: booking.booking_status === 'awaiting_payment',
      invoice_id: booking.invoice_id,
      message: booking.booking_status === 'awaiting_payment' ? 'Place reserved. Pay the session invoice to confirm your booking.' : 'Enrolled successfully'
    });

  } catch (err) {

    if (err.code === "23505") {
      return res.json({
        ok: false,
        message: "Already enrolled"
      });
    }

    console.error(err);

    res.status(err.status || 500).json({
      ok: false,
      success: false,
      message: err.status ? err.message : "Failed to enroll"
    });

  }

};

export const getMyBookings = async (req,res)=>{

  const user_id = req.user?.sub;
  const gymId = req.gymId;

 const result = await db.query(
  `
  SELECT 
    s.id,
    s.gym_id,
    b.booking_status,
    b.invoice_id,
    s.is_paid,
    s.price,
    c.name AS class_name,
    TO_CHAR(s.starts_at,'FMDay') AS day,
    TO_CHAR(s.starts_at,'HH24:MI') AS time
  FROM class_bookings b
  JOIN class_sessions s 
    ON s.id = b.session_id
    AND s.gym_id = $2
  JOIN class_types c 
    ON c.id = s.class_type_id
    AND c.gym_id = $2
  WHERE b.user_id = $1
    AND b.gym_id = $2
  `,
  [user_id, gymId]
);

  res.json(result.rows);

};
