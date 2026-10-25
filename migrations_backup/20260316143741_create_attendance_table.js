/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable("attendance", (table) => {
    table.increments("id").primary();

    table.integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.integer("session_id")
      .nullable()
      .references("id")
      .inTable("class_sessions")
      .onDelete("SET NULL");

    table.integer("gym_id").nullable();

    table.timestamp("check_in_time")
      .defaultTo(knex.fn.now());

    table.integer("created_by")
      .references("id")
      .inTable("users");

    table.timestamps(true, true);
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTable("attendance");
}