/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  return knex.schema.createTable('member_physique_lifestyle', (table) => {
    table.increments('id').primary();

    table.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');

    table.string('primary_goal').defaultTo('select');
    table.float('current_weight');
    table.float('target_weight');
    table.float('height');
    table.float('waist');

    table.integer('protein');
    table.integer('carbs');
    table.integer('fats');

    table.text('notes');

    table.string('occupation');
    table.string('stress_level');
    table.string('sleep_hours');
    table.string('activity_level');
    table.string('exercise_frequency');
    table.string('sitting_hours');

    table.specificType('current_activities', 'text[]');
    table.specificType('training_styles', 'text[]');

    table.timestamps(true, true);
  });
};


/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists('member_physique_lifestyle');
};
