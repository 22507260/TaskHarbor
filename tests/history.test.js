import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { samples } from '../server/definition.js';

function fixture(t) {
  let now = 1000;
  const store = new Store(':memory:', () => now);
  t.after(() => store.close());
  const workflow = store.createWorkflow(samples[0]);
  return { store, workflow, advance: () => now++ };
}
test('keyset pages visit every matching run exactly once, including timestamp ties', (t) => {
  const { store, workflow } = fixture(t);
  const ids = Array.from({ length: 23 }, () => store.start(workflow.id).id)
    .sort()
    .reverse();
  let page = store.runHistory({ limit: 5 }),
    seen = [];
  while (true) {
    assert.equal(page.total, 23);
    assert.ok(page.items.length <= 5);
    seen.push(...page.items.map((r) => r.id));
    if (!page.nextCursor) break;
    page = store.runHistory({ limit: 5, cursor: page.nextCursor });
  }
  assert.deepEqual(seen, ids);
  assert.equal(new Set(seen).size, 23);
});
test('new arrivals do not shift anchored pages; refresh discovers them', (t) => {
  const { store, workflow, advance } = fixture(t);
  const ids = Array.from({ length: 8 }, () => {
    advance();
    return store.start(workflow.id).id;
  });
  const first = store.runHistory({ limit: 3 });
  // A late insert with an old timestamp must also stay outside the rowid boundary.
  const arrival = store.start(workflow.id);
  let page = store.runHistory({ limit: 3, cursor: first.nextCursor });
  const seen = [...first.items.map((r) => r.id)];
  while (true) {
    seen.push(...page.items.map((r) => r.id));
    if (!page.nextCursor) break;
    page = store.runHistory({ limit: 3, cursor: page.nextCursor });
  }
  assert.deepEqual(seen, ids.reverse());
  assert.ok(!seen.includes(arrival.id));
  assert.equal(store.runHistory({ snapshot: first.snapshot }).total, 8);
  assert.equal(store.runHistory().total, 9);
});
test('search matches historical names and IDs with literal wildcard characters and Unicode folding', (t) => {
  const { store } = fixture(t);
  const original = store.createWorkflow({ ...samples[0], name: 'MÜŞTERİ 100%_safe' });
  const oldRun = store.start(original.id);
  store.updateWorkflow(original.id, 1, { ...original, name: 'Renamed workflow' });
  const newer = store.start(original.id);
  assert.deepEqual(
    store.runHistory({ q: 'müşteri' }).items.map((r) => r.id),
    [oldRun.id],
  );
  assert.deepEqual(
    store.runHistory({ q: '%_' }).items.map((r) => r.id),
    [oldRun.id],
  );
  assert.deepEqual(
    store.runHistory({ q: newer.id.slice(0, 8).toUpperCase() }).items.map((r) => r.id),
    [newer.id],
  );
  assert.equal(store.runHistory({ q: "' OR 1=1 --" }).total, 0);
  assert.deepEqual(
    store.runHistory({ q: 'RENAMED' }).items.map((r) => r.id),
    [newer.id],
  );
});
test('combined filters, accurate summary counts and payload omission', (t) => {
  const { store, workflow } = fixture(t);
  const other = store.createWorkflow(samples[1]);
  const keep = store.start(workflow.id, { privatePayload: 'not in summaries' }),
    drop = store.start(other.id);
  store.cancel(drop.id);
  let job = store.claim('worker');
  store.complete(job.id, job.token, { validated: true });
  const page = store.runHistory({ workflowId: workflow.id, status: 'running', q: 'Order' });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].id, keep.id);
  assert.equal(page.items[0].step_count, 3);
  assert.equal(page.items[0].completed_steps, 1);
  assert.equal('input' in page.items[0], false);
  assert.equal('definition' in page.items[0], false);
  assert.equal('jobs' in page.items[0], false);
  assert.equal(store.runHistory({ workflowId: workflow.id, status: 'cancelled' }).total, 0);
});
test('cursor rejects corruption and reuse with different filters', (t) => {
  const { store, workflow } = fixture(t);
  for (let i = 0; i < 3; i++) store.start(workflow.id);
  const first = store.runHistory({ limit: 1, q: 'Order' });
  for (const query of [
    { cursor: 'not_a_cursor' },
    { cursor: first.nextCursor, q: 'changed' },
    { cursor: first.nextCursor, q: 'Order', snapshot: first.snapshot + 1 },
  ]) {
    assert.throws(
      () => store.runHistory(query),
      (e) => e.statusCode === 400,
    );
  }
});
test('global overview stays accurate beyond the legacy 100-run window', (t) => {
  const { store, workflow, advance } = fixture(t);
  for (let i = 0; i < 105; i++) {
    advance();
    const run = store.start(workflow.id);
    if (i < 5) store.cancel(run.id);
  }
  const summary = store.overview();
  assert.equal(summary.total, 105);
  assert.equal(summary.active, 100);
  assert.equal(summary.succeeded, 0);
  assert.equal(summary.completed, 0);
  assert.equal(summary.latestByWorkflow[0].status, 'queued');
  assert.equal(store.runs().length, 100);
});
test('overview treats only success and failure as completed executions', (t) => {
  const { store } = fixture(t);
  const workflow = store.createWorkflow({
    name: 'One step',
    steps: [{ id: 'one', name: 'One', type: 'transform', maxAttempts: 1 }],
  });
  store.start(workflow.id);
  let job = store.claim('worker');
  store.complete(job.id, job.token, {});
  store.start(workflow.id);
  job = store.claim('worker');
  store.complete(job.id, job.token, null, 'Permanent error');
  const cancelled = store.start(workflow.id);
  store.cancel(cancelled.id);
  assert.deepEqual(
    { ...store.overview(), latestByWorkflow: [] },
    { total: 3, active: 0, succeeded: 1, completed: 2, latestByWorkflow: [] },
  );
});
test('history API validates bounds and keeps legacy array responses compatible', async (t) => {
  const store = new Store(':memory:');
  store.seed();
  const app = createApp(store);
  t.after(() => app.close());
  assert.deepEqual((await app.inject('/api/run-history')).json(), {
    items: [],
    total: 0,
    snapshot: 0,
    nextCursor: null,
  });
  for (const query of [
    'limit=0',
    'limit=51',
    'limit=no',
    'status=unknown',
    'snapshot=-1',
    'cursor=invalid',
    'q=' + 'x'.repeat(101),
  ])
    assert.equal((await app.inject('/api/run-history?' + query)).statusCode, 400);
  assert.ok(Array.isArray((await app.inject('/api/runs')).json()));
  assert.equal((await app.inject('/api/overview')).json().total, 0);
});
