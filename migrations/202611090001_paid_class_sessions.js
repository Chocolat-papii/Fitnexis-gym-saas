export async function up(knex) {
  await knex.schema.alterTable('class_sessions', table => {
    table.boolean('is_paid').notNullable().defaultTo(false);
    table.decimal('price', 10, 2).notNullable().defaultTo(0);
    table.check('(is_paid = false AND price = 0) OR (is_paid = true AND price > 0)', [], 'class_sessions_payment_terms');
  });
  await knex.schema.alterTable('class_bookings', table => {
    table.integer('invoice_id').nullable().references('id').inTable('invoices').onDelete('RESTRICT');
    table.unique(['invoice_id']);
    table.index(['gym_id', 'session_id', 'booking_status']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('class_bookings', table => {
    table.dropIndex(['gym_id', 'session_id', 'booking_status']);
    table.dropUnique(['invoice_id']);
    table.dropColumn('invoice_id');
  });
  await knex.schema.alterTable('class_sessions', table => {
    table.dropChecks('class_sessions_payment_terms');
    table.dropColumn('price');
    table.dropColumn('is_paid');
  });
}
