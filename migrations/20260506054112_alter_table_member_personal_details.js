export async function up(knex) {
    await knex.schema.alterTable('member_contact_details', (table) => {
    table.unique(['user_id', 'gym_id'], 'unique_user_gym_contact');
  });

  await knex.schema.alterTable('member_health_records', (table) => {
    table.unique(['user_id', 'gym_id'], 'unique_user_gym_health');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('member_contact_details', (table) => {
    table.dropUnique(['user_id', 'gym_id'], 'unique_user_gym_contact');
  });

  await knex.schema.alterTable('member_health_records', (table) => {
    table.dropUnique(['user_id', 'gym_id'], 'unique_user_gym_health');
  });

}