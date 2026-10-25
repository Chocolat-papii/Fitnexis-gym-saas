export async function up(knex) {
  await knex.schema.alterTable('member_profile', (table) => {
    table.unique(['user_id', 'gym_id'], 'unique_user_gym_member_profile');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('member_profile', (table) => {
    table.dropUnique(['user_id', 'gym_id'], 'unique_user_gym_member_profile');
  });
}