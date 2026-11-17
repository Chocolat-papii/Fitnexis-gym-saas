export async function up(k){
  await k.schema.createTable('member_change_emails',t=>{
    t.bigIncrements('id');
    t.bigInteger('event_id').notNullable().references('id').inTable('audit_events');
    t.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    t.integer('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('recipient',255).notNullable();
    t.jsonb('message').notNullable();
    t.string('status',20).notNullable().defaultTo('pending');
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('next_attempt_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.timestamp('lease_until',{useTz:true}).nullable();
    t.timestamp('sent_at',{useTz:true}).nullable();
    t.string('last_error',100).nullable();
    t.timestamp('created_at',{useTz:true}).notNullable().defaultTo(k.fn.now());
    t.unique(['event_id','recipient']);
    t.index(['status','next_attempt_at']);t.index(['gym_id','event_id']);t.index(['user_id']);
    t.check("status IN ('pending','sending','sent','failed')");
  });
  // These notices are server-only; Fitnexis checks gym permissions in Express.
  // Protect the table in the same migration transaction that creates it.
  await k.raw('ALTER TABLE public.member_change_emails ENABLE ROW LEVEL SECURITY');
  await k.raw('REVOKE ALL ON TABLE public.member_change_emails FROM PUBLIC');
  await k.raw('REVOKE ALL ON SEQUENCE public.member_change_emails_id_seq FROM PUBLIC');
  const {rows:roles}=await k.raw("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
  for(const {rolname} of roles){
    await k.raw('REVOKE ALL ON TABLE public.member_change_emails FROM ??',[rolname]);
    await k.raw('REVOKE ALL ON SEQUENCE public.member_change_emails_id_seq FROM ??',[rolname]);
  }
}
export async function down(k){await k.schema.dropTable('member_change_emails');}
