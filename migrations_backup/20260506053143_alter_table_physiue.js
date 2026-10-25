export async function up(knex) {
  await knex.schema.alterTable('member_physique_lifestyle', (table) => {
    table.unique(['user_id', 'gym_id'], 'unique_user_gym_physique');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('member_physique_lifestyle', (table) => {
    table.dropUnique(['user_id', 'gym_id'], 'unique_user_gym_physique');
  });
}