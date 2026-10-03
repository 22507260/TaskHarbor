import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
test('API validates definitions, starts persistent runs and cancels them', async (t) => {
  const store = new Store(':memory:');
  store.seed();
  const app = createApp(store);
  t.after(() => app.close());
  let response = await app.inject({
    method: 'POST',
    url: '/api/workflows',
    payload: { name: 'Invalid', steps: [] },
  });
  assert.equal(response.statusCode, 400);
  response = await app.inject('/api/workflows');
  const workflows = response.json();
  assert.equal(workflows.length, 3);
  response = await app.inject({
    method: 'POST',
    url: `/api/workflows/${workflows[0].id}/runs`,
    payload: { input: { ticket: 7 } },
  });
  assert.equal(response.statusCode, 201);
  const run = response.json();
  assert.equal(run.input.ticket, 7);
  response = await app.inject({ method: 'POST', url: `/api/runs/${run.id}/cancel` });
  assert.equal(response.json().status, 'cancelled');
  assert.equal((await app.inject('/api/runs/missing')).statusCode, 404);
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/workflows/missing/runs', payload: {} }))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflows[0].id}/runs`,
        payload: { input: [] },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/workflows/${workflows[0].id}/runs`,
        headers: { origin: 'https://unrelated.example' },
        payload: {},
      })
    ).statusCode,
    403,
  );
});
