/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Add to member_contact_details
  await knex.schema.alterTable("member_contact_details", (table) => {
    table.string("gender");
    table.date("birthDate");
  });

  // Add to member_health_records
  await knex.schema.alterTable("member_health_records", (table) => {
    table.text("medication");
  });
}


/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */


export async function down(knex) {
  await knex.schema.alterTable("member_contact_details", (table) => {
    table.dropColumn("gender");
    table.dropColumn("birthDate");
  });

  await knex.schema.alterTable("member_health_records", (table) => {
    table.dropColumn("medication");
  });
}