export async function up(k) {
  for (const table of ['users','platform_admins']) await k.schema.alterTable(table,t=>t.timestamp('email_verified_at',{useTz:true}).nullable());
  await k.schema.alterTable('mfa_challenges',t=>{
    t.string('method',20).notNullable().defaultTo('totp');
    t.string('purpose',20).notNullable().defaultTo('login');
    t.text('email').nullable();
    t.integer('auth_version').nullable();
    t.index(['scope','actor_id','expires_at'],'email_challenge_account_expiry');
  });
  await k.schema.createTable('google_login_requests',t=>{
    t.string('id',64).primary();t.string('scope',10).notNullable();t.uuid('gym_id').nullable();
    t.text('origin').notNullable();t.text('verifier').notNullable();t.string('nonce',64).notNullable();
    t.timestamp('expires_at',{useTz:true}).notNullable();t.timestamp('used_at',{useTz:true}).nullable();
  });
  await k.raw(`CREATE FUNCTION fitnexis_reset_email_verification() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.email IS DISTINCT FROM OLD.email THEN NEW.email_verified_at := NULL; END IF; RETURN NEW; END $$`);
  for(const table of ['users','platform_admins'])await k.raw(`CREATE TRIGGER reset_email_verification BEFORE UPDATE OF email ON ${table} FOR EACH ROW EXECUTE FUNCTION fitnexis_reset_email_verification()`);
}
export async function down(k) {
  for(const table of ['users','platform_admins'])await k.raw(`DROP TRIGGER reset_email_verification ON ${table}`);
  await k.raw('DROP FUNCTION fitnexis_reset_email_verification()');
  await k.schema.dropTable('google_login_requests');
  await k.schema.alterTable('mfa_challenges',t=>{t.dropIndex(['scope','actor_id','expires_at'],'email_challenge_account_expiry');t.dropColumns('method','purpose','email','auth_version');});
  for(const table of ['users','platform_admins'])await k.schema.alterTable(table,t=>t.dropColumn('email_verified_at'));
}
