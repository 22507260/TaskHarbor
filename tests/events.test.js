import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { samples } from '../server/definition.js';
function fixture(t) {
  const store = new Store(':memory:', () => 100);
  const workflow = store.createWorkflow(samples[0]),
    run = store.start(workflow.id);
  const app = createApp(store);
  t.after(() => app.close());
  return { store, run, app };
}
test('event pages are complete in both directions despite timestamp ties and isolate runs', (t) => {
  const { store, run } = fixture(t);
  for (let i = 0; i < 125; i++) store.event(run.id, 'validate', 'job.started', 'Record ' + i);
  const other = store.start(run.workflow_id);
  store.event(other.id, null, 'run.failed', 'Other run');
  for (const order of ['oldest', 'newest']) {
    const seen = [];
    let cursor;
    do {
      const page = store.eventHistory(run.id, { limit: 17, order, cursor });
      assert.equal(page.total, 126);
      assert.equal(page.recorded, 126);
      seen.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(seen).size, 126);
    assert.deepEqual(
      seen,
      store
        .run(run.id)
        .events.map((e) => e.id)
        .sort((a, b) => (order === 'oldest' ? a - b : b - a)),
    );
  }
});
test('continuation excludes appended events and a refreshed first page discovers them', (t) => {
  const { store, run } = fixture(t);
  for (let i = 0; i < 6; i++) store.event(run.id, 'validate', 'job.started', 'Record');
  const first = store.eventHistory(run.id, { limit: 3, order: 'newest' });
  store.event(run.id, 'validate', 'job.retry', 'New arrival');
  const next = store.eventHistory(run.id, { limit: 3, order: 'newest', cursor: first.nextCursor });
  assert.equal(next.snapshot, first.snapshot);
  assert.equal(next.total, 7);
  assert.ok(next.items.every((e) => e.id <= first.snapshot));
  const refreshed = store.eventHistory(run.id, { order: 'newest' });
  assert.equal(refreshed.total, 8);
  assert.equal(refreshed.items[0].message, 'New arrival');
});
test('SQL event filters combine Unicode literal search, groups and exact step identity', (t) => {
  const { store, run } = fixture(t);
  store.event(run.id, 'validate', 'job.failed', 'ＣＡＦÉ [100%]');
  store.event(run.id, 'enrich', 'job.retry', 'Transient failure');
  store.event(run.id, 'enrich', 'job.recovered', 'Lease expired');
  store.event(run.id, null, 'run.failed', 'Run failed');
  assert.equal(
    store.eventHistory(run.id, { q: 'cafe\u0301', category: 'errors', step: 'validate' }).total,
    1,
  );
  assert.equal(store.eventHistory(run.id, { q: '[100%]' }).total, 1);
  assert.equal(store.eventHistory(run.id, { q: '.*' }).total, 0);
  assert.equal(store.eventHistory(run.id, { category: 'errors' }).total, 2);
  assert.equal(store.eventHistory(run.id, { category: 'retries', step: 'enrich' }).total, 1);
  assert.equal(store.eventHistory(run.id, { category: 'recovery' }).total, 1);
  assert.equal(store.eventHistory(run.id, { q: 'WORKFLOW' }).total, 2);
  assert.equal(store.eventHistory(run.id, { q: 'job.retry' }).items[0].step_id, 'enrich');
});
test('event cursor rejects changed filters, order, run scope and malformed data', (t) => {
  const { store, run } = fixture(t);
  store.event(run.id, 'validate', 'job.started', 'Started');
  const cursor = store.eventHistory(run.id, { limit: 1 }).nextCursor;
  for (const query of [
    { category: 'errors' },
    { q: 'Started' },
    { step: 'validate' },
    { order: 'newest' },
  ])
    assert.throws(
      () => store.eventHistory(run.id, { ...query, cursor }),
      (error) => error.statusCode === 400,
    );
  const other = store.start(run.workflow_id);
  assert.throws(
    () => store.eventHistory(other.id, { cursor }),
    (error) => error.statusCode === 400,
  );
  for (const invalid of ['!', 'e30', '123'])
    assert.throws(
      () => store.eventHistory(run.id, { cursor: invalid }),
      (error) => error.statusCode === 400,
    );
});
test('API bounds event responses and preserves legacy full-detail responses', async (t) => {
  const { store, run, app } = fixture(t);
  for (let i = 0; i < 75; i++) store.event(run.id, 'validate', 'job.started', 'Record');
  const response = await app.inject(`/api/runs/${run.id}/events`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items.length, 50);
  assert.equal(response.json().total, 76);
  assert.equal((await app.inject(`/api/runs/${run.id}?events=omit`)).json().events.length, 0);
  assert.equal((await app.inject(`/api/runs/${run.id}`)).json().events.length, 76);
  for (const query of [
    'limit=0',
    'limit=51',
    'limit=no',
    'order=random',
    'category=random',
    'step=',
    'q=' + 'x'.repeat(101),
    'cursor=!',
  ])
    assert.equal((await app.inject(`/api/runs/${run.id}/events?${query}`)).statusCode, 400, query);
  assert.equal((await app.inject(`/api/runs/${run.id}?events=invalid`)).statusCode, 400);
  assert.equal((await app.inject('/api/runs/missing/events')).statusCode, 404);
});
