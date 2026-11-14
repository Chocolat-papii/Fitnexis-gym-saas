/** Called inside the receipt/settlement transaction, while the invoice is locked. */
export async function confirmPaidSessionBooking(client, gymId, invoiceId) {
  await client.query(`UPDATE memberships m SET status='active',updated_at=NOW() FROM invoices i
    WHERE i.id=$2 AND i.gym_id=$1 AND i.membership_id=m.id AND m.gym_id=i.gym_id AND m.user_id=i.user_id AND m.status='awaiting_payment'`,[gymId,invoiceId]);
  await client.query(`UPDATE class_bookings SET booking_status='booked'
    WHERE gym_id=$1 AND invoice_id=$2 AND booking_status='awaiting_payment'`, [gymId, invoiceId]);
}
