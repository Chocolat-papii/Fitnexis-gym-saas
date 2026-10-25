export async function up(knex) {
  // Ensure UUID generator exists
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Set default UUID (SAFE for primary key)
  await knex.raw(`
    ALTER TABLE gyms
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE gyms
    ALTER COLUMN id DROP DEFAULT;
  `);
}