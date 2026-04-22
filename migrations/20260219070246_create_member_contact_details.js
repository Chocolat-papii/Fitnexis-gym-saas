/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  console.log("Skipping legacy migration - table was originally created manually");
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */


export async function down(knex) {
  console.log("No rollback needed");
}