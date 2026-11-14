export async function up(k) {
  await k.schema.alterTable('plans',t=>{t.integer('custom_days').nullable();t.check('custom_days BETWEEN 1 AND 3660',[],'plans_custom_days_range');});
  await k.schema.alterTable('gym_subscriptions',t=>t.timestamp('billing_anchor',{useTz:true}).nullable());
}
export async function down(k) {
  await k.schema.alterTable('gym_subscriptions',t=>t.dropColumn('billing_anchor'));
  await k.schema.alterTable('plans',t=>{t.dropChecks('plans_custom_days_range');t.dropColumn('custom_days');});
}
