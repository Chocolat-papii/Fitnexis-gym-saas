/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    await knex.raw(`
    CREATE TABLE member_health_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

       user_id INTEGER NOT NULL UNIQUE
          REFERENCES users(id) ON DELETE CASCADE,

        medical_conditions TEXT,
        injuries TEXT,
        health_notes TEXT,
        consent_share_trainer BOOLEAN DEFAULT FALSE,

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
        `);
  };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS member_health_records;
  `);
}
