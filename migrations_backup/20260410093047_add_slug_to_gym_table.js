export async function up(knex) {
  await knex.schema.alterTable("gyms", (table) => {
    table.text("slug").nullable().defaultTo("mashfitness");
    table.unique("slug");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("gyms", (table) => {
    table.dropUnique("slug");
    table.dropColumn("slug");
  });
}