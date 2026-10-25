/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
// migrations/20260225_create_member_dietary_info.js

export async function up(knex) {
  return knex.schema.createTable('member_dietary_info', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    table.string('diet_type', 50);
    table.smallint('meals_per_day');
    table.decimal('water_per_day', 4, 1);
    table.text('foods_avoid');
    table.text('supplements');
    table.decimal('hydration_goal', 4, 1);
    table.text('allergies');
    table.text('restrictions');
    table.string('preferred_checkin_day', 10);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists('member_dietary_info');
}
