/** Called inside the receipt/settlement transaction, while the invoice is locked. */
export async function confirmPaidSessionBooking(client, gymId, invoiceId) {
  await client.query(`UPDATE class_bookings SET booking_status='booked'
    WHERE gym_id=$1 AND invoice_id=$2 AND booking_status='awaiting_payment'`, [gymId, invoiceId]);
}
