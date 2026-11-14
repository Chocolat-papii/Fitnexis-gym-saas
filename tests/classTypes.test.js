import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { createClassType as createClassTypeService } from '../src/services/classTypes.service.js';
import { createClassType } from '../src/controllers/admin/classActivities.controller.js';

test('Class creation passes the authenticated gym to the insert and ignores a browser gym_id', async () => {
  const original = db.query;
  let inserted;
  const response = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    db.query = async (sql, values) => {
      inserted = values;
      return { rows: [{ id: 4, name: values[0], gym_id: values[3] }] };
    };
    await createClassType({ gymId: 'authenticated-gym', body: { name: 'Salsa', description: 'Dance class', default_duration_minutes: 60, gym_id: 'forged-gym' } }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(inserted[3], 'authenticated-gym');
    assert.equal(response.body.data.gym_id, 'authenticated-gym');
    assert.equal(response.body.message, 'Class created successfully.');
  } finally { db.query = original; }
});

test('Missing gym context is rejected before attempting a class-type insert', async () => {
  const original = db.query;
  let wrote = false;
  try {
    db.query = async () => { wrote = true; return { rows: [] }; };
    await assert.rejects(() => createClassTypeService({ name: 'Salsa', gym_id: 'browser-gym' }), error => error.status === 400 && /Gym context/.test(error.message));
    assert.equal(wrote, false);
  } finally { db.query = original; }
});
