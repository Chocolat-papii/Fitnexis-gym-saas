import { db } from "../config/db.js";

export const createBooking = async (session_id, user_id, gymId) => {

  return db.query(`
    INSERT INTO class_bookings
    (session_id, user_id, booking_status, booked_at, gym_id)
    VALUES ($1, $2, 'booked', NOW(), $3)
  `, [session_id, user_id, gymId]);

};

export const getUserBookings = async (user_id, gymId) => {

  const result = await db.query(`
    SELECT session_id
    FROM class_bookings
    WHERE user_id = $1
    AND gym_id = $2
    AND booking_status = 'booked'
  `,[user_id, gymId]);

  return result.rows;

};