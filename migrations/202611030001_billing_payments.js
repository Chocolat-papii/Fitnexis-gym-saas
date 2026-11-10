/** Add tenant-safe billing metadata without disturbing existing memberships. */
export async function up(knex) {
  await knex.schema.alterTable('plans', table => {
    table.boolean('is_active').notNullable().defaultTo(true);
    table.check('price >= 0', [], 'plans_price_positive_or_zero');
  });
  await knex.schema.alterTable('memberships', table => {
    table.date('next_bill_on').nullable();
    table.boolean('auto_invoice').notNullable().defaultTo(true);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index(['gym_id', 'next_bill_on', 'status']);
  });
  await knex.schema.alterTable('invoices', table => {
    table.string('invoice_number', 48).nullable();
    table.text('description').nullable();
    table.date('period_start').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index(['gym_id', 'status', 'due_at']);
    table.check('amount >= 0', [], 'invoices_amount_positive_or_zero');
  });
  await knex.raw("UPDATE invoices SET invoice_number = 'INV-' || LPAD(id::text, 8, '0') WHERE invoice_number IS NULL");
  await knex.schema.alterTable('invoices', table => {
    table.unique(['gym_id', 'invoice_number']);
  });
  await knex.raw('CREATE UNIQUE INDEX invoices_one_cycle_per_membership ON invoices (gym_id, membership_id, period_start) WHERE membership_id IS NOT NULL AND period_start IS NOT NULL');
  await knex.schema.alterTable('payments', table => {
    table.string('status', 20).notNullable().defaultTo('succeeded');
    table.string('currency', 3).notNullable().defaultTo('ZAR');
    table.integer('recorded_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.text('checkout_url').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['gym_id', 'provider', 'reference']);
    table.check('amount > 0', [], 'payments_amount_positive');
  });
  await knex.raw("CREATE UNIQUE INDEX payments_one_pending_paystack ON payments(gym_id, invoice_id) WHERE provider='paystack' AND status='pending'");
  await knex.schema.createTable('gym_payment_settings', table => {
    table.uuid('gym_id').primary().references('id').inTable('gyms').onDelete('CASCADE');
    table.string('paystack_subaccount', 100).nullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('billing_plan_requests', table => {
    table.increments('id').primary();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('plan_id').notNullable().references('id').inTable('plans').onDelete('CASCADE');
    table.text('reason').notNullable().defaultTo('');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('resolved_at').nullable();
    table.index(['gym_id', 'status']);
  });
  await knex.schema.createTable('billing_reminders', table => {
    table.increments('id').primary();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.integer('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    table.string('kind', 40).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['gym_id', 'invoice_id', 'kind']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('billing_reminders');
  await knex.schema.dropTableIfExists('billing_plan_requests');
  await knex.schema.dropTableIfExists('gym_payment_settings');
  await knex.raw('DROP INDEX IF EXISTS payments_one_pending_paystack');
  await knex.schema.alterTable('payments', table => {
    table.dropChecks('payments_amount_positive');
    table.dropUnique(['gym_id', 'provider', 'reference']);
    table.dropColumn('status'); table.dropColumn('currency'); table.dropColumn('recorded_by');
    table.dropColumn('checkout_url'); table.dropColumn('created_at');
  });
  await knex.raw('DROP INDEX IF EXISTS invoices_one_cycle_per_membership');
  await knex.schema.alterTable('invoices', table => {
    table.dropChecks('invoices_amount_positive_or_zero');
    table.dropUnique(['gym_id', 'invoice_number']);
    table.dropIndex(['gym_id', 'status', 'due_at']);
    table.dropColumn('invoice_number'); table.dropColumn('description');
    table.dropColumn('period_start'); table.dropColumn('updated_at');
  });
  await knex.schema.alterTable('memberships', table => {
    table.dropIndex(['gym_id', 'next_bill_on', 'status']);
    table.dropColumn('next_bill_on'); table.dropColumn('auto_invoice'); table.dropColumn('updated_at');
  });
  await knex.schema.alterTable('plans', table => {
    table.dropChecks('plans_price_positive_or_zero'); table.dropColumn('is_active');
  });
}
