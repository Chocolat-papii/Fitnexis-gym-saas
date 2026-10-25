/**
 * Fresh-install baseline: gyms and users.
 * ESM migration for Knex 3.x.
 */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await knex.schema.createTable('gyms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 150).notNullable();
    table.string('slug', 150).notNullable().unique();
    table.string('email', 255).nullable();
    table.string('phone', 50).nullable();
    table.text('address').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('firstname', 100).notNullable();
    table.string('lastname', 100).notNullable();
    table.string('phone', 50).notNullable();
    table.string('email', 255).notNullable();
    // Kept nullable to match the recovered legacy schema; registration still hashes passwords.
    table.string('password', 255).nullable();
    table.string('tier', 50).notNullable().defaultTo('Gold');
    table.date('joindate').nullable().defaultTo(knex.raw('CURRENT_DATE'));
    table.string('role', 50).notNullable().defaultTo('member');
    table.string('status', 50).notNullable().defaultTo('active');
    table.uuid('gym_id').notNullable()
      .references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['email', 'gym_id'], { indexName: 'users_email_gym_unique' });
    table.index('gym_id', 'users_gym_id_idx');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('gyms');
}
