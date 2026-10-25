export async function up(knex) {
  await knex.schema.alterTable('member_dietary_info', (table) => {
    table.unique(['user_id', 'gym_id'], 'unique_user_gym_dietary');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('member_dietary_info', (table) => {
    table.dropUnique(['user_id', 'gym_id'], 'unique_user_gym_dietary');
  });
}