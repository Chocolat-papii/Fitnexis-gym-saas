export async function up(knex) {
  await knex.schema.createTable('platform_enquiries', table => {
    table.increments('id').primary();
    table.string('name', 150).notNullable();
    table.string('email', 255).notNullable();
    table.string('gym_name', 150).notNullable();
    table.string('interest', 50).notNullable();
    table.text('message').notNullable().defaultTo('');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('reviewed_at').nullable();
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('platform_enquiries');
}
