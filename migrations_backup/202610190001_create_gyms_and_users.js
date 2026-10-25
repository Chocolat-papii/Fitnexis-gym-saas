export async function up(knex) {
  await knex.schema.createTable("gyms", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());

    table.string("name", 150).notNullable();
    table.string("slug", 150).notNullable().unique();
    table.string("email", 255);
    table.text("address");

    table.timestamps(true, true);
  });

  await knex.schema.createTable("users", (table) => {
    table.increments("id").primary();

    table.string("firstname", 100).notNullable();
    table.string("lastname", 100).notNullable();
    table.string("phone", 30);
    table.string("email", 255).notNullable();
    table.string("password", 255).notNullable();
    table.string("role", 50).notNullable().defaultTo("member");

    table.uuid("gym_id")
      .notNullable()
      .references("id")
      .inTable("gyms")
      .onDelete("CASCADE");

    table.timestamps(true, true);

    // A user email is unique within a gym, not necessarily globally.
    table.unique(["email", "gym_id"]);
    table.index("gym_id");
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("gyms");
}