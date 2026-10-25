/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.alterTable("member_contact_details", (table) => {
    table.renameColumn("birthDate", "birthdate");
  });
}



/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable("member_contact_details", (table) => {
    table.renameColumn("birthdate", "birthDate");
  });
}
