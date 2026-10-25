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
    await knex.schema.alterTable(tableName, (table) => {
      table.uuid("gym_id").nullable();
    });
  }
}

export async function down(knex) {
  for (const tableName of tables) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn("gym_id");
    });
  }
}