export async function up(k) {
  await k.schema.alterTable('users',t=>t.unique(['id','gym_id'],'users_id_gym_unique'));
  await k.schema.alterTable('staff_branch_access',t=>t.foreign(['user_id','gym_id']).references(['id','gym_id']).inTable('users').onDelete('CASCADE'));
  await k.schema.alterTable('class_sessions',t=>{
    t.integer('branch_id').nullable();
    t.foreign(['branch_id','gym_id']).references(['id','gym_id']).inTable('gym_branches');
  });
  await k.schema.createTable('trainer_assignments',t=>{
    t.integer('trainer_id').notNullable();t.integer('member_id').notNullable();t.uuid('gym_id').notNullable();
    t.foreign(['trainer_id','gym_id']).references(['id','gym_id']).inTable('users').onDelete('CASCADE');
    t.foreign(['member_id','gym_id']).references(['id','gym_id']).inTable('users').onDelete('CASCADE');
    t.primary(['trainer_id','member_id','gym_id']);
  });
}
export async function down(k) {
  await k.schema.dropTableIfExists('trainer_assignments');
  await k.schema.alterTable('class_sessions',t=>{t.dropForeign(['branch_id','gym_id']);t.dropColumn('branch_id');});
  await k.schema.alterTable('staff_branch_access',t=>t.dropForeign(['user_id','gym_id']));
  await k.schema.alterTable('users',t=>t.dropUnique(['id','gym_id'],'users_id_gym_unique'));
}
