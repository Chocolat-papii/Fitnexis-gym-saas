export async function up(k) {
  await k.schema.dropTableIfExists('google_login_requests');
}

export async function down(k) {
  await k.schema.createTable('google_login_requests',t=>{
    t.string('id',64).primary();
    t.string('scope',10).notNullable();
    t.uuid('gym_id').nullable();
    t.text('origin').notNullable();
    t.text('verifier').notNullable();
    t.string('nonce',64).notNullable();
    t.timestamp('expires_at',{useTz:true}).notNullable();
    t.timestamp('used_at',{useTz:true}).nullable();
  });
}
