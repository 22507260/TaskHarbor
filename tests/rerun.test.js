import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { execute } from '../server/tasks.js';

function setup(t) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const workflow = store.createWorkflow({
    name: 'Delivery',
    steps: [
      {
        id: 'deliver',
        name: 'Delivery checkpoint',
        type: 'checkpoint',
        config: { delayMs: 0, failUntilAttempt: 1 },
        maxAttempts: 1,
      },
    ],
  });
  const source = store.start(workflow.id, { ticket: 7 });
  const job = store.claim('worker');
  store.complete(job.id, job.token, null, 'Controlled failure');
  return { store, workflow, source: store.run(source.id) };
}
test('source rerun reproduces its snapshot with fresh jobs, attempts and lineage', async (t) => {
  const { store, workflow, source } = setup(t),
    original = JSON.stringify(source);
  store.updateWorkflow(workflow.id, 1, {
    ...workflow,
    name: 'Revised delivery',
    steps: [{ id: 'ready', name: 'Ready', type: 'transform' }],
  });
  const { run } = store.rerun(source.id, { requestId: randomUUID() });
  assert.notEqual(run.id, source.id);
  assert.equal(run.parent_run_id, source.id);
  assert.equal(run.workflow_version, 1);
  assert.equal(run.definition.name, 'Delivery');
  assert.deepEqual(run.input, { ticket: 7 });
  assert.equal(run.jobs[0].attempt, 0);
  assert.notEqual(run.jobs[0].id, source.jobs[0].id);
  assert.equal(run.jobs[0].output, null);
  assert.ok(run.events.some((e) => e.type === 'run.rerun'));
  const job = store.claim('worker');
  await assert.rejects(execute(job), /Simulated transient failure/);
  store.complete(job.id, job.token, null, 'Controlled failure');
  assert.equal(store.run(run.id).status, 'failed');
  assert.equal(JSON.stringify(store.run(source.id)), original);
});
test('latest rerun uses the selected current version and edited input', async (t) => {
  const { store, workflow, source } = setup(t);
  store.updateWorkflow(workflow.id, 1, {
    ...workflow,
    steps: [
      { id: 'ready', name: 'Ready', type: 'transform', config: { fields: { approved: true } } },
    ],
  });
  const { run } = store.rerun(source.id, {
    requestId: randomUUID(),
    mode: 'latest',
    expectedVersion: 2,
    input: { ticket: 8 },
  });
  assert.equal(run.workflow_version, 2);
  assert.equal(run.jobs[0].step_id, 'ready');
  const job = store.claim('worker');
  store.complete(job.id, job.token, await execute(job));
  assert.equal(store.run(run.id).status, 'succeeded');
  assert.deepEqual(store.run(run.id).jobs[0].output, { ticket: 8, approved: true });
  assert.deepEqual(store.run(source.id).input, { ticket: 7 });
});
test('idempotency reuses a run, normalizes key order, and rejects changed requests', (t) => {
  const { store, source } = setup(t),
    requestId = randomUUID();
  const first = store.rerun(source.id, { requestId, input: { a: 1, nested: { b: 2, c: 3 } } });
  const second = store.rerun(source.id, { input: { nested: { c: 3, b: 2 }, a: 1 }, requestId });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.run.id, second.run.id);
  assert.throws(
    () => store.rerun(source.id, { requestId, input: { a: 2 } }),
    (e) => e.statusCode === 409,
  );
  assert.equal(store.overview().total, 2);
});
test('active sources and changed latest versions are rejected without side effects', (t) => {
  const { store, workflow, source } = setup(t);
  const active = store.start(workflow.id);
  assert.throws(
    () => store.rerun(active.id, { requestId: randomUUID() }),
    (e) => e.statusCode === 409,
  );
  store.updateWorkflow(workflow.id, 1, { ...workflow, name: 'Changed' });
  assert.throws(
    () => store.rerun(source.id, { requestId: randomUUID(), mode: 'latest', expectedVersion: 1 }),
    (e) => e.statusCode === 409,
  );
  assert.equal(store.overview().total, 2);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM run_requests').get().count, 0);
});
test('cancelled sources and chains of reruns preserve direct parent links', (t) => {
  const { store, source } = setup(t);
  const child = store.rerun(source.id, { requestId: randomUUID() }).run;
  store.cancel(child.id);
  const grandchild = store.rerun(child.id, { requestId: randomUUID() }).run;
  assert.equal(grandchild.parent_run_id, child.id);
  assert.equal(
    store.runHistory().items.find((r) => r.id === grandchild.id).parent_run_id,
    child.id,
  );
});
test('API returns 201 for creation, 200 for replay and validates rerun requests', async (t) => {
  const store = new Store(':memory:'),
    workflow = store.createWorkflow({
      name: 'Simple',
      steps: [{ id: 'one', name: 'One', type: 'transform' }],
    });
  const source = store.start(workflow.id);
  store.cancel(source.id);
  const app = createApp(store);
  t.after(() => app.close());
  const requestId = randomUUID(),
    post = (payload) =>
      app.inject({ method: 'POST', url: '/api/runs/' + source.id + '/rerun', payload });
  const first = await post({ requestId });
  assert.equal(first.statusCode, 201);
  const second = await post({ requestId });
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().id, second.json().id);
  for (const body of [
    {},
    { requestId: 'invalid' },
    { requestId: randomUUID(), input: [] },
    { requestId: randomUUID(), mode: 'latest' },
    { requestId: randomUUID(), mode: 'invalid' },
  ])
    assert.equal((await post(body)).statusCode, 400);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/runs/missing/rerun',
        payload: { requestId: randomUUID() },
      })
    ).statusCode,
    404,
  );
});
test('independent API processes deduplicate the same rerun request transactionally', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskharbor-rerun-')),
    path = join(directory, 'queue.db');
  const store = new Store(path);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true });
  });
  const workflow = store.createWorkflow({
      name: 'Concurrent',
      steps: [{ id: 'one', name: 'One', type: 'transform' }],
    }),
    source = store.start(workflow.id);
  store.cancel(source.id);
  const requestId = randomUUID();
  const replay = () =>
    new Promise((resolve, reject) => {
      const script = `import {Store} from './server/store.js';const s=new Store(process.argv[1]);try{console.log(s.rerun(process.argv[2],{requestId:process.argv[3]}).run.id);}finally{s.close();}`;
      const child = spawn(process.execPath, [
        '--input-type=module',
        '-e',
        script,
        path,
        source.id,
        requestId,
      ]);
      let output = '',
        error = '';
      child.stdout.on('data', (x) => (output += x));
      child.stderr.on('data', (x) => (error += x));
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error))));
    });
  const [one, two] = await Promise.all([replay(), replay()]);
  assert.equal(one, two);
  assert.equal(store.overview().total, 2);
});
