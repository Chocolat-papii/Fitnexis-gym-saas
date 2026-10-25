/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {

  await knex.schema.alterTable("class_bookings", table => {

    table.renameColumn("member_id", "user_id");

  });

  await knex.raw(`
    ALTER TABLE class_bookings
    ADD CONSTRAINT unique_booking
    UNIQUE (user_id, session_id);
  `);

}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {

  await knex.raw(`
    ALTER TABLE class_bookings
    DROP CONSTRAINT unique_booking;
  `);

  await knex.schema.alterTable("class_bookings", table => {

    table.renameColumn("user_id", "member_id");

  });

}
