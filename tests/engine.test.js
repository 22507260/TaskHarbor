import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { samples, workflowSchema } from '../server/definition.js';
import { execute } from '../server/tasks.js';

function fixture(t, definition = samples[0]) {
  let now = 10000;
  const store = new Store(':memory:', () => now);
  t.after(() => store.close());
  const workflow = store.createWorkflow(definition),
    run = store.start(workflow.id, { order: 42 });
  return {
    store,
    run,
    advance: (ms) => {
      now += ms;
    },
  };
}
test('rejects cycles, duplicate IDs, unknown dependencies and unbounded delays', () => {
  for (const steps of [
    [
      { id: 'a', name: 'A', type: 'delay', dependsOn: ['b'] },
      { id: 'b', name: 'B', type: 'delay', dependsOn: ['a'] },
    ],
    [
      { id: 'a', name: 'A', type: 'delay' },
      { id: 'a', name: 'B', type: 'delay' },
    ],
    [{ id: 'a', name: 'A', type: 'delay', dependsOn: ['missing'] }],
    [{ id: 'a', name: 'A', type: 'delay', config: { delayMs: 99999 } }],
  ])
    assert.equal(workflowSchema.safeParse({ name: 'Invalid', steps }).success, false);
});
test('dependencies open only after success; output flows through the DAG', async (t) => {
  const { store, run } = fixture(t);
  const first = store.claim('one');
  assert.equal(first.step_id, 'validate');
  assert.equal(store.claim('two'), null);
  store.complete(first.id, first.token, await execute(first));
  const second = store.claim('two');
  assert.equal(second.step_id, 'enrich');
  assert.equal(second.dependencies.validate.validated, true);
  store.complete(second.id, second.token, second.dependencies.validate);
  const last = store.claim('one');
  store.complete(last.id, last.token, await execute(last));
  assert.equal(store.run(run.id).status, 'succeeded');
  assert.equal(store.run(run.id).jobs[2].output.order, 42);
});
test('retry backoff is durable and exhausts the attempt budget', (t) => {
  const { store, run, advance } = fixture(t, {
    name: 'Retry',
    steps: [{ id: 'a', name: 'A', type: 'checkpoint', maxAttempts: 2 }],
  });
  let job = store.claim('one');
  store.complete(job.id, job.token, null, 'Unavailable');
  assert.equal(store.claim('one'), null);
  advance(1000);
  job = store.claim('one');
  assert.equal(job.attempt, 2);
  store.complete(job.id, job.token, null, 'Unavailable');
  assert.equal(store.run(run.id).status, 'failed');
  assert.equal(store.claim('one'), null);
});
test('expired lease is recovered and stale completion/renewal are fenced', (t) => {
  const { store, advance } = fixture(t);
  const old = store.claim('old');
  advance(5001);
  assert.equal(store.complete(old.id, old.token, {}), false);
  const fresh = store.claim('new');
  assert.equal(fresh.id, old.id);
  assert.equal(fresh.attempt, 2);
  assert.equal(store.renew(old.id, old.token), false);
  assert.equal(store.complete(old.id, old.token, { stale: true }), false);
  assert.equal(store.complete(fresh.id, fresh.token, {}), true);
});
test('renewal keeps a slow task owned by its worker', (t) => {
  const { store, advance } = fixture(t);
  const job = store.claim('one');
  advance(4000);
  assert.equal(store.renew(job.id, job.token), true);
  advance(4000);
  assert.equal(store.claim('two'), null);
  assert.equal(store.complete(job.id, job.token, {}), true);
});
test('cancellation invalidates leases and queued work', (t) => {
  const { store, run } = fixture(t);
  const job = store.claim('one');
  store.cancel(run.id);
  assert.equal(store.complete(job.id, job.token, {}), false);
  assert.equal(store.claim('one'), null);
  assert.equal(store.run(run.id).status, 'cancelled');
});
test('failed ancestors skip descendants but allow independent branches to finish', (t) => {
  const { store, run } = fixture(t, {
    name: 'Branches',
    steps: [
      { id: 'a', name: 'A', type: 'delay', maxAttempts: 1 },
      { id: 'b', name: 'B', type: 'delay', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'delay', dependsOn: ['b'] },
      { id: 'd', name: 'D', type: 'delay' },
    ],
  });
  let job = store.claim('one');
  store.complete(job.id, job.token, null, 'Permanent failure');
  job = store.claim('one');
  assert.equal(job.step_id, 'd');
  store.complete(job.id, job.token, {});
  assert.deepEqual(
    store.run(run.id).jobs.map((j) => j.status),
    ['failed', 'skipped', 'skipped', 'succeeded'],
  );
  assert.equal(store.run(run.id).status, 'failed');
});
test('separate database connections claim distinct jobs and survive reopen', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskharbor-')),
    path = join(directory, 'queue.db');
  const one = new Store(path),
    two = new Store(path);
  t.after(() => {
    one.close();
    two.close();
    rmSync(directory, { recursive: true });
  });
  const workflow = one.createWorkflow(samples[0]);
  const run = one.start(workflow.id);
  const claim = one.claim('one');
  assert.equal(two.claim('two'), null);
  assert.equal(two.run(run.id).jobs[0].token, claim.token);
  const reopened = new Store(path);
  assert.equal(reopened.run(run.id).status, 'running');
  reopened.close();
});
test('run snapshots keep their definition independent of later workflow changes', (t) => {
  const { store, run } = fixture(t);
  store.db
    .prepare('UPDATE workflows SET definition=?')
    .run(JSON.stringify({ name: 'Changed', steps: [] }));
  assert.equal(store.run(run.id).definition.name, 'Order enrichment');
});
