import { v4 as uuidv4 } from "uuid";

export async function up(knex) {
  return knex.schema.createTable("gyms", (table) => {
    table.uuid("id").primary();
    table.string("name");
    table.string("email");
    table.string("phone");
    table.string("address");
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  return knex.schema.dropTable("gyms");
}