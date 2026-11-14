export async function up(knex) {
  await knex.schema.createTable('platform_admins', table => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('name', 150).notNullable();
    table.string('password', 255).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('platform_sessions', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('admin_id').notNullable().references('id').inTable('platform_admins').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamp('logged_out_at').nullable();
    table.index(['admin_id', 'expires_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('platform_sessions');
  await knex.schema.dropTableIfExists('platform_admins');
}
