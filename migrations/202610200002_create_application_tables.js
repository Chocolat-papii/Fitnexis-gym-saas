/**
 * Fresh-install baseline for application tables.
 * Tables are created after gyms/users so foreign keys can be declared in place.
 */
export async function up(knex) {
  await knex.schema.createTable('plans', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.decimal('price', 10, 2).notNullable().defaultTo(0);
    table.string('billing_cycle').notNullable().defaultTo('monthly');
    table.text('description').nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.unique(['name', 'gym_id'], { indexName: 'plans_name_gym_unique' });
    table.index('gym_id');
  });

  await knex.schema.createTable('class_types', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.text('description').nullable();
    table.integer('default_duration_minutes').nullable().defaultTo(60);
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.unique(['name', 'gym_id'], { indexName: 'class_types_name_gym_unique' });
    table.index('gym_id');
  });

  await knex.schema.createTable('memberships', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('plan_id').notNullable().references('id').inTable('plans').onDelete('RESTRICT');
    table.date('start_date').notNullable().defaultTo(knex.raw('CURRENT_DATE'));
    table.date('end_date').nullable();
    table.string('status').notNullable().defaultTo('active');
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'gym_id']);
    table.index(['plan_id', 'gym_id']);
  });

  await knex.schema.createTable('invoices', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('membership_id').nullable().references('id').inTable('memberships').onDelete('SET NULL');
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency').notNullable().defaultTo('ZAR');
    table.string('status').notNullable().defaultTo('due');
    table.timestamp('issued_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('due_at').nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.index(['user_id', 'gym_id']);
    table.index('membership_id');
  });

  await knex.schema.createTable('payments', (table) => {
    table.increments('id').primary();
    table.integer('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    table.string('provider').notNullable().defaultTo('cash');
    table.decimal('amount', 10, 2).notNullable();
    table.timestamp('paid_at').nullable().defaultTo(knex.fn.now());
    table.string('reference').nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.index(['invoice_id', 'gym_id']);
  });

  await knex.schema.createTable('class_sessions', (table) => {
    table.increments('id').primary();
    table.integer('class_type_id').notNullable().references('id').inTable('class_types').onDelete('RESTRICT');
    table.integer('trainer_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('starts_at').notNullable();
    table.timestamp('ends_at').nullable();
    table.time('start_time').nullable();
    table.integer('capacity').notNullable().defaultTo(20);
    table.string('location').nullable();
    table.string('status').notNullable().defaultTo('scheduled');
    table.boolean('waitlist_enabled').notNullable().defaultTo(false);
    table.integer('cancellation_deadline_hours').notNullable().defaultTo(24);
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable().defaultTo(knex.fn.now());
    table.index(['starts_at', 'gym_id']);
    table.index(['ends_at', 'gym_id']);
  });

  await knex.schema.createTable('class_bookings', (table) => {
    table.increments('id').primary();
    table.integer('session_id').notNullable().references('id').inTable('class_sessions').onDelete('CASCADE');
    // Current naming convention is user_id, not the legacy member_id.
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('booking_status').notNullable().defaultTo('booked');
    table.timestamp('booked_at').nullable().defaultTo(knex.fn.now());
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.unique(['user_id', 'session_id'], { indexName: 'class_bookings_user_session_unique' });
    table.index(['user_id', 'gym_id']);
    table.index(['session_id', 'gym_id']);
  });

  await knex.schema.createTable('member_profile', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('profile_picture').notNullable().defaultTo('/images/profile-pic.jpg');
    table.string('display_name').nullable();
    table.text('bio').notNullable().defaultTo('I am a fit, strong and healthy, I take the world by storm!');
    table.boolean('mail_note').notNullable().defaultTo(false);
    table.boolean('sms_note').notNullable().defaultTo(false);
    table.boolean('wa_note').notNullable().defaultTo(false);
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'gym_id'], { indexName: 'member_profile_user_gym_unique' });
  });

  await knex.schema.createTable('member_contact_details', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('whatsapp_number').nullable();
    table.string('alt_phone').nullable();
    table.text('street_address').nullable();
    table.string('city').nullable();
    table.string('province').nullable();
    table.string('postal_code').nullable();
    table.text('notes').nullable();
    table.string('gender').nullable();
    table.date('birthdate').nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'gym_id'], { indexName: 'member_contact_user_gym_unique' });
  });

  await knex.schema.createTable('member_emergency_contacts', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('ecname').nullable();
    table.string('relationship').nullable();
    table.string('phone').nullable();
    table.text('ems_notes').nullable();
    table.string('priority', 20).notNullable().defaultTo('primary');
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'gym_id']);
  });

  await knex.schema.createTable('member_health_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('medical_conditions').nullable();
    table.text('injuries').nullable();
    table.text('health_notes').nullable();
    table.boolean('consent_share_trainer').notNullable().defaultTo(false);
    table.text('medication').nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'gym_id'], { indexName: 'member_health_user_gym_unique' });
  });

  await knex.schema.createTable('member_dietary_info', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('diet_type', 50).nullable();
    table.smallint('meals_per_day').nullable();
    table.decimal('water_per_day', 4, 1).nullable();
    table.text('foods_avoid').nullable();
    table.text('supplements').nullable();
    table.decimal('hydration_goal', 4, 1).nullable();
    table.text('allergies').nullable();
    table.text('restrictions').nullable();
    table.string('preferred_checkin_day', 10).nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'gym_id'], { indexName: 'member_dietary_user_gym_unique' });
  });

  await knex.schema.createTable('member_physique_lifestyle', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('primary_goal').nullable().defaultTo('select');
    table.float('current_weight').nullable();
    table.float('target_weight').nullable();
    table.float('height').nullable();
    table.float('waist').nullable();
    table.integer('protein').nullable();
    table.integer('carbs').nullable();
    table.integer('fats').nullable();
    table.text('notes').nullable();
    table.string('occupation').nullable();
    table.string('stress_level').nullable();
    table.string('sleep_hours').nullable();
    table.string('activity_level').nullable();
    table.string('exercise_frequency').nullable();
    table.string('sitting_hours').nullable();
    table.specificType('current_activities', 'text[]').nullable();
    table.specificType('training_styles', 'text[]').nullable();
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'gym_id'], { indexName: 'member_physique_user_gym_unique' });
  });

  await knex.schema.createTable('attendance', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('session_id').nullable().references('id').inTable('class_sessions').onDelete('SET NULL');
    table.timestamp('check_in_time').notNullable().defaultTo(knex.fn.now());
    table.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.uuid('gym_id').notNullable().references('id').inTable('gyms').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'gym_id']);
    table.index(['check_in_time', 'gym_id']);
  });
}

export async function down(knex) {
  // Drop in reverse dependency order.
  for (const tableName of [
    'attendance',
    'member_physique_lifestyle',
    'member_dietary_info',
    'member_health_records',
    'member_emergency_contacts',
    'member_contact_details',
    'member_profile',
    'class_bookings',
    'class_sessions',
    'payments',
    'invoices',
    'memberships',
    'class_types',
    'plans',
  ]) {
    await knex.schema.dropTableIfExists(tableName);
  }
}
