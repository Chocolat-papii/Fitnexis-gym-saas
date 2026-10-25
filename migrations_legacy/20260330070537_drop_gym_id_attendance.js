export async function up(knex) {
  return knex.schema.alterTable("attendance", (table) => {
    table.dropColumn("gym_id");
  });
}

export async function down(knex) {
  return knex.schema.alterTable("attendance", (table) => {
    table.integer("gym_id");
  });
}