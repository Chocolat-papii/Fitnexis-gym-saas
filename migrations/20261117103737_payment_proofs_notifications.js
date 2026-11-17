export async function up(k) {
  await k.schema.alterTable('gym_payment_settings',t=>t.text('manual_payment_instructions').notNullable().defaultTo(''));
  await k.schema.alterTable('platform_notifications', t => { t.string('action_url',500).nullable(); t.index(['gym_id','audience','created_at']); });
  await k.schema.alterTable('payments', t => {
    t.string('manual_reference_key',200).nullable(); t.string('receipt_number',60).nullable().unique();
    t.date('received_on').nullable(); t.text('confirmation_note').nullable();
  });
  await k.raw("CREATE UNIQUE INDEX payments_manual_reference_key ON payments(gym_id,provider,manual_reference_key) WHERE manual_reference_key IS NOT NULL");
  await k.schema.createTable('payment_submissions', t => {
    t.bigIncrements('id'); t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.string('method',10).notNullable(); t.string('reference_key',200).notNullable();
    t.string('status',20).notNullable().defaultTo('pending'); t.integer('version').notNullable().defaultTo(1);
    t.integer('payment_id').nullable().unique().references('id').inTable('payments').onDelete('RESTRICT');
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.check("method IN ('eft','cash')"); t.check("status IN ('pending','info_requested','rejected','approved')");
    t.index(['gym_id','status','updated_at']); t.index(['gym_id','invoice_id']); t.index(['user_id']);
  });
  await k.raw("CREATE UNIQUE INDEX payment_submissions_active_reference ON payment_submissions(gym_id,method,reference_key) WHERE status IN ('pending','info_requested','approved')");
  await k.raw("CREATE UNIQUE INDEX payment_submissions_one_open ON payment_submissions(gym_id,invoice_id) WHERE status IN ('pending','info_requested')");
  await k.schema.createTable('payment_submission_versions', t => {
    t.bigIncrements('id'); t.bigInteger('submission_id').notNullable().references('id').inTable('payment_submissions').onDelete('CASCADE');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE'); t.integer('version').notNullable();
    t.decimal('amount',10,2).notNullable(); t.date('paid_on').notNullable(); t.string('reference',200).notNullable(); t.text('notes').notNullable().defaultTo('');
    t.text('object_path').notNullable(); t.string('file_name',200).notNullable(); t.string('mime',50).notNullable(); t.integer('file_size').notNullable(); t.string('sha256',64).notNullable();
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.unique(['submission_id','version']); t.index(['gym_id','sha256']);
    t.check('amount > 0'); t.check('file_size > 0 AND file_size <= 5242880');
  });
  await k.schema.createTable('payment_submission_reviews', t => {
    t.bigIncrements('id'); t.bigInteger('submission_id').notNullable().references('id').inTable('payment_submissions').onDelete('CASCADE');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE'); t.integer('version').notNullable();
    t.integer('reviewed_by').nullable().references('id').inTable('users').onDelete('SET NULL'); t.string('action',20).notNullable(); t.text('message').notNullable();
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.index(['submission_id','created_at']); t.index(['gym_id']); t.index(['reviewed_by']);
    t.check("action IN ('approved','rejected','info_requested')");
  });
  await k.schema.createTable('manual_payment_reversals', t => {
    t.integer('payment_id').primary().references('id').inTable('payments').onDelete('CASCADE');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('reversed_by').nullable().references('id').inTable('users').onDelete('SET NULL'); t.text('reason').notNullable();
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.index(['gym_id']); t.index(['reversed_by']);
  });
  await k.schema.createTable('notification_reads', t => {
    t.integer('notification_id').notNullable().references('id').inTable('platform_notifications').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE'); t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.timestamp('read_at',{useTz:true}).notNullable().defaultTo(k.fn.now()); t.primary(['notification_id','user_id']); t.index(['gym_id','user_id']); t.index(['user_id']);
  });
  for (const table of ['payment_submission_versions','manual_payment_reversals']) await k.raw(`CREATE TRIGGER ?? BEFORE UPDATE ON ?? FOR EACH ROW EXECUTE FUNCTION public.fitnexis_audit_immutable()`,[table+'_immutable',table]);
  // Only the server's existing authenticated application routes may access these records.
  const {rows:roles}=await k.raw("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
  for (const table of ['payment_submissions','payment_submission_versions','payment_submission_reviews','manual_payment_reversals','notification_reads']) {
    await k.raw('ALTER TABLE ?? ENABLE ROW LEVEL SECURITY',[table]); await k.raw('REVOKE ALL ON TABLE ?? FROM PUBLIC',[table]);
    for(const {rolname} of roles) await k.raw('REVOKE ALL ON TABLE ?? FROM ??',[table,rolname]);
    if(!['notification_reads','manual_payment_reversals'].includes(table)) {
      await k.raw('REVOKE ALL ON SEQUENCE ?? FROM PUBLIC',[table+'_id_seq']);
      for(const {rolname} of roles) await k.raw('REVOKE ALL ON SEQUENCE ?? FROM ??',[table+'_id_seq',rolname]);
    }
  }
}
export async function down(k) {
  await k.schema.alterTable('gym_payment_settings',t=>t.dropColumn('manual_payment_instructions'));
  for(const table of ['notification_reads','manual_payment_reversals','payment_submission_reviews','payment_submission_versions','payment_submissions']) await k.schema.dropTable(table);
  await k.raw('DROP INDEX payments_manual_reference_key');
  await k.schema.alterTable('payments',t=>{t.dropUnique(['receipt_number']);for(const c of ['manual_reference_key','receipt_number','received_on','confirmation_note'])t.dropColumn(c);});
  await k.schema.alterTable('platform_notifications',t=>{t.dropIndex(['gym_id','audience','created_at']);t.dropColumn('action_url');});
}
