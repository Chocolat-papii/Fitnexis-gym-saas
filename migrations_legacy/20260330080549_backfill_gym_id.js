const GYM_ID = "bae0bfda-a38c-480b-9de7-919a3e100a6f";

const tables = [
  "attendance",
  "class_bookings",
  "class_sessions",
  "class_types",
  "invoices",
  "member_contact_details",
  "member_dietary_info",
  "member_emergency_contacts",
  "member_health_records",
  "member_physique_lifestyle",
  "member_profile",
  "memberships",
  "payments",
  "plans",
  "users",
];

export async function up(knex) {
  for (const tableName of tables) {
    await knex(tableName).update({ gym_id: GYM_ID });
  }
}

export async function down(knex) {
  for (const tableName of tables) {
    await knex(tableName).update({ gym_id: null });
  }
}