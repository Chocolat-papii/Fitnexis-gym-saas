import { v4 as uuidv4 } from "uuid";

const GYM_ID = uuidv4();

export async function up(knex) {
  await knex("gyms").insert({
    id: GYM_ID,
    name: "Mash Fitness Club",
    email: "mashfitnessclub@gmail.com",
    phone: "0795370418",
    address: "Rabie Ridge Sports Ground",
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  // Store this ID somewhere safe (env, config, etc.)
  console.log("DEFAULT GYM ID:", GYM_ID);
}

export async function down(knex) {
  return knex("gyms").del();
}