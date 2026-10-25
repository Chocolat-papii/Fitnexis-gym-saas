/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {

  const hasStartTime = await knex.schema.hasColumn("class_sessions", "start_time");
  const hasUpdatedAt = await knex.schema.hasColumn("class_sessions", "updated_at");
  const hasWaitlist = await knex.schema.hasColumn("class_sessions", "waitlist_enabled");
  const hasCancelDeadline = await knex.schema.hasColumn("class_sessions", "cancellation_deadline_hours");

  await knex.schema.alterTable("class_sessions", (table) => {

    if (!hasStartTime) {
      table.time("start_time");
    }

    if (!hasUpdatedAt) {
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    }

    if (!hasWaitlist) {
      table.boolean("waitlist_enabled").defaultTo(false);
    }

    if (!hasCancelDeadline) {
      table.integer("cancellation_deadline_hours").defaultTo(24);
    }

  });

  // indexes only if columns exist
  const hasStartAt = await knex.schema.hasColumn("class_sessions", "start_at");
  const hasEndAt = await knex.schema.hasColumn("class_sessions", "end_at");

  await knex.schema.alterTable("class_sessions", (table) => {

    if (hasStartAt) {
      table.index(["start_at"]);
    }

    if (hasEndAt) {
      table.index(["end_at"]);
    }

  });

}


/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {

  await knex.schema.alterTable("class_sessions", (table) => {
    table.dropColumn("start_time");
    table.dropColumn("updated_at");
    table.dropColumn("waitlist_enabled");
    table.dropColumn("cancellation_deadline_hours");
  });

}
