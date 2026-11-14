export async function up(k) {
  await k.schema.alterTable('users', t => {
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('auth_version').notNullable().defaultTo(1);
    t.text('mfa_secret').nullable();
    t.bigInteger('mfa_counter').notNullable().defaultTo(-1);
  });
  await k.schema.alterTable('platform_admins', t => {
    t.string('role', 40).notNullable().defaultTo('fitnexis_admin');
    t.text('mfa_secret').nullable();
    t.bigInteger('mfa_counter').notNullable().defaultTo(-1);
  });
  await k.raw("UPDATE platform_admins SET role='fitnexis_super_admin' WHERE id=(SELECT MIN(id) FROM platform_admins)");
  await k.schema.alterTable('gyms', t => {
    t.string('account_status', 30).notNullable().defaultTo('active');
    t.integer('owner_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.jsonb('business_info').notNullable().defaultTo('{}');
    t.integer('commission_bps').nullable();
    t.check('commission_bps BETWEEN 0 AND 10000', [], 'gym_commission_range');
    t.check("account_status IN ('pending','active','suspended','inactive')", [], 'gym_account_status');
  });
  // Only infer ownership where there is exactly one existing administrator.
  await k.raw(`UPDATE gyms g SET owner_id=x.id FROM
    (SELECT gym_id,MIN(id) AS id FROM users WHERE role='admin' GROUP BY gym_id HAVING COUNT(*)=1) x WHERE x.gym_id=g.id`);
  await k.raw("UPDATE users SET role='gym_super_admin' WHERE id IN (SELECT owner_id FROM gyms WHERE owner_id IS NOT NULL)");
  await k.schema.alterTable('platform_sessions', t => {
    t.boolean('mfa_verified').notNullable().defaultTo(false);
    t.timestamp('reauth_until', {useTz:true}).nullable();
  });
  await k.schema.createTable('gym_auth_sessions', t => {
    t.uuid('id').primary().defaultTo(k.raw('gen_random_uuid()'));
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.boolean('mfa_verified').notNullable().defaultTo(false);
    t.timestamp('expires_at', {useTz:true}).notNullable();
    t.timestamp('revoked_at', {useTz:true}).nullable();
    t.timestamp('reauth_until', {useTz:true}).nullable();
    t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
  });
  await k.schema.createTable('mfa_challenges', t => {
    t.string('id',64).primary();
    t.string('scope',10).notNullable();
    t.integer('actor_id').notNullable();
    t.uuid('gym_id').nullable();
    t.text('secret').nullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('expires_at', {useTz:true}).notNullable();
    t.timestamp('used_at', {useTz:true}).nullable();
  });
  await k.schema.createTable('audit_events', t => {
    t.bigIncrements('id');
    t.string('actor_scope',20).notNullable();
    t.integer('actor_id').nullable();
    t.uuid('gym_id').nullable();
    t.string('action',100).notNullable();
    t.string('resource',150).nullable();
    t.jsonb('details').notNullable().defaultTo('{}');
    t.timestamp('created_at', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.index(['gym_id','created_at']);
    t.index(['action','created_at']);
  });
  await k.raw(`CREATE FUNCTION fitnexis_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$`);
  await k.raw('CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION fitnexis_audit_immutable()');
  await k.schema.createTable('platform_billing_config', t => {
    t.integer('id').primary();
    t.integer('commission_bps').notNullable().defaultTo(200);
    t.string('fee_bearer',20).notNullable().defaultTo('subaccount');
    t.integer('grace_days').notNullable().defaultTo(7);
    t.check('commission_bps BETWEEN 0 AND 10000');
    t.check("fee_bearer IN ('account','subaccount')");
    t.check('grace_days BETWEEN 0 AND 60');
  });
  await k('platform_billing_config').insert({id:1});
  await k.schema.alterTable('gym_payment_settings', t => {
    t.string('onboarding_status',30).notNullable().defaultTo('not_started');
    t.string('provider_mode',10).nullable();
    t.string('bank_last4',4).nullable();
    t.string('bank_code',30).nullable();
    t.boolean('payout_eligible').notNullable().defaultTo(false);
    t.timestamp('verified_at', {useTz:true}).nullable();
    t.string('operation_id',64).nullable();
    t.text('last_error').nullable();
    t.unique('paystack_subaccount');
  });
  await k.raw("UPDATE gym_payment_settings SET onboarding_status='requires_review' WHERE paystack_subaccount IS NOT NULL");
  await k.schema.createTable('saas_plans', t => {
    t.increments('id');
    t.string('name',100).notNullable();
    t.bigInteger('price_cents').notNullable();
    t.string('interval',10).notNullable().defaultTo('monthly');
    t.jsonb('features').notNullable().defaultTo('[]');
    t.jsonb('limits').notNullable().defaultTo('{}');
    t.boolean('is_active').notNullable().defaultTo(false);
    t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
    t.check('price_cents >= 0 AND price_cents <= 100000000');
    t.check("interval IN ('monthly','annual')");
  });
  await k.schema.createTable('gym_subscriptions', t => {
    t.uuid('gym_id').primary().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('plan_id').nullable().references('id').inTable('saas_plans').onDelete('RESTRICT');
    t.string('status',20).notNullable().defaultTo('trialing');
    t.timestamp('period_start', {useTz:true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('period_end', {useTz:true}).notNullable().defaultTo(k.raw("NOW()+INTERVAL '14 days'"));
    t.boolean('cancel_at_period_end').notNullable().defaultTo(false);
    t.boolean('auto_renew').notNullable().defaultTo(false);
    t.text('authorization_secret').nullable();
    t.string('billing_email',255).nullable();
    t.bigInteger('authorized_amount_cents').nullable();
    t.integer('pending_plan_id').nullable().references('id').inTable('saas_plans');
    t.timestamp('updated_at', {useTz:true}).defaultTo(k.fn.now());
    t.check("status IN ('trialing','active','overdue','cancelled','expired')");
  });
  await k.raw('INSERT INTO gym_subscriptions(gym_id) SELECT id FROM gyms');
  await k.schema.createTable('saas_invoices', t => {
    t.increments('id');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('plan_id').notNullable().references('id').inTable('saas_plans');
    t.bigInteger('amount_cents').notNullable();
    t.string('interval',10).notNullable();
    t.timestamp('period_start', {useTz:true}).notNullable();
    t.timestamp('period_end', {useTz:true}).notNullable();
    t.string('status',20).notNullable().defaultTo('due');
    t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
    t.unique(['gym_id','period_start']);
  });
  await k.schema.createTable('saas_payments', t => {
    t.increments('id');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('invoice_id').notNullable().references('id').inTable('saas_invoices').onDelete('CASCADE');
    t.string('reference',64).notNullable().unique();
    t.string('status',20).notNullable().defaultTo('pending');
    t.string('provider_mode',10).notNullable();
    t.boolean('auto_renew_requested').notNullable().defaultTo(false);
    t.text('checkout_url').nullable();
    t.timestamp('paid_at', {useTz:true}).nullable();
    t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
  });
  await k.raw("CREATE UNIQUE INDEX saas_one_pending_payment ON saas_payments(invoice_id) WHERE status='pending'");
  await k.schema.alterTable('payments', t => {
    t.integer('commission_bps').notNullable().defaultTo(0);
    t.bigInteger('commission_cents').notNullable().defaultTo(0);
    t.bigInteger('gateway_fee_cents').nullable();
    t.string('fee_bearer',20).nullable();
    t.string('subaccount_code',100).nullable();
    t.string('provider_mode',10).nullable();
    t.string('provider_transaction_id',100).nullable();
    t.bigInteger('refunded_cents').notNullable().defaultTo(0);
    t.bigInteger('commission_refunded_cents').notNullable().defaultTo(0);
    t.string('settlement_status',30).notNullable().defaultTo('unreconciled');
    t.string('settlement_id',100).nullable();
    t.string('dispute_status',30).nullable();
    t.check('commission_cents >= 0 AND refunded_cents >= 0', [], 'payments_commercial_amounts');
  });
  await k.schema.createTable('payment_refunds', t => {
    t.increments('id');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.string('reference',64).notNullable().unique();
    t.string('provider_id',100).nullable().unique();
    t.bigInteger('amount_cents').notNullable();
    t.string('status',30).notNullable().defaultTo('pending');
    t.text('reason').notNullable();
    t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
    t.check('amount_cents > 0');
  });
  await k.schema.createTable('platform_notifications', t => {
    t.increments('id');
    t.uuid('gym_id').nullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('user_id').nullable();
    t.string('audience',20).notNullable();
    t.string('kind',80).notNullable();
    t.string('dedupe_key',180).notNullable().unique();
    t.text('message').notNullable();
    t.timestamp('created_at', {useTz:true}).defaultTo(k.fn.now());
    t.timestamp('read_at', {useTz:true}).nullable();
  });
  await k.schema.createTable('gym_branches', t => {
    t.increments('id');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.string('name',150).notNullable();
    t.text('address').nullable();
    t.jsonb('hours').notNullable().defaultTo('{}');
    t.jsonb('facilities').notNullable().defaultTo('[]');
    t.unique(['id','gym_id']);
  });
  await k.schema.createTable('staff_branch_access', t => {
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('branch_id').notNullable();
    t.uuid('gym_id').notNullable();
    t.foreign(['branch_id','gym_id']).references(['id','gym_id']).inTable('gym_branches').onDelete('CASCADE');
    t.primary(['user_id','branch_id']);
  });
  await k.schema.createTable('ownership_transfers', t => {
    t.uuid('id').primary().defaultTo(k.raw('gen_random_uuid()'));
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('from_user_id').notNullable().references('id').inTable('users');
    t.integer('to_user_id').notNullable().references('id').inTable('users');
    t.timestamp('expires_at', {useTz:true}).notNullable();
    t.timestamp('accepted_at', {useTz:true}).nullable();
  });
  await k.schema.createTable('support_grants', t => {
    t.uuid('id').primary().defaultTo(k.raw('gen_random_uuid()'));
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('platform_admin_id').notNullable().references('id').inTable('platform_admins');
    t.integer('approved_by').notNullable().references('id').inTable('users');
    t.text('reason').notNullable();
    t.timestamp('expires_at', {useTz:true}).notNullable();
    t.timestamp('revoked_at', {useTz:true}).nullable();
  });
}

export async function down(k) {
  for (const table of ['support_grants','ownership_transfers','staff_branch_access','gym_branches','platform_notifications','payment_refunds']) await k.schema.dropTableIfExists(table);
  await k.schema.alterTable('payments', t => { t.dropChecks('payments_commercial_amounts'); for(const c of ['commission_bps','commission_cents','gateway_fee_cents','fee_bearer','subaccount_code','provider_mode','provider_transaction_id','refunded_cents','commission_refunded_cents','settlement_status','settlement_id','dispute_status']) t.dropColumn(c); });
  for(const table of ['saas_payments','saas_invoices','gym_subscriptions','saas_plans','platform_billing_config']) await k.schema.dropTableIfExists(table);
  await k.schema.alterTable('gym_payment_settings', t => { t.dropUnique('paystack_subaccount'); for(const c of ['onboarding_status','provider_mode','bank_last4','bank_code','payout_eligible','verified_at','operation_id','last_error']) t.dropColumn(c); });
  await k.schema.dropTableIfExists('audit_events');
  await k.raw('DROP FUNCTION IF EXISTS fitnexis_audit_immutable()');
  await k.schema.dropTableIfExists('mfa_challenges');
  await k.schema.dropTableIfExists('gym_auth_sessions');
  await k.schema.alterTable('platform_sessions', t => {t.dropColumn('mfa_verified');t.dropColumn('reauth_until');});
  await k.schema.alterTable('gyms', t => {t.dropChecks('gym_commission_range');t.dropChecks('gym_account_status');for(const c of ['account_status','owner_id','business_info','commission_bps'])t.dropColumn(c);});
  await k.raw("UPDATE users SET role='admin' WHERE role IN ('gym_super_admin','gym_admin','gym_manager','gym_receptionist','gym_trainer')");
  await k.schema.alterTable('users', t => {for(const c of ['is_active','auth_version','mfa_secret','mfa_counter'])t.dropColumn(c);});
  await k.schema.alterTable('platform_admins', t => {for(const c of ['role','mfa_secret','mfa_counter'])t.dropColumn(c);});
}
