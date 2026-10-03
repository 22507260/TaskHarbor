import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.js';
import { samples } from '../server/definition.js';
import { execute } from '../server/tasks.js';
import { createApp } from '../server/app.js';

test('editing preserves active run snapshots and creates an immutable revision', async (t) => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const original = store.createWorkflow(samples[0]);
  const oldRun = store.start(original.id, { order: 42 });
  const claimed = store.claim('worker');
  const updated = store.updateWorkflow(original.id, 1, {
    ...original,
    name: 'Order enrichment v2',
    steps: [{ ...original.steps[0], config: { fields: { validated: false } } }],
  });
  assert.equal(updated.version, 2);
  assert.equal(store.run(oldRun.id).workflow_version, 1);
  assert.equal(store.run(oldRun.id).definition.name, original.name);
  assert.equal(store.run(oldRun.id).jobs.length, 3);
  store.complete(claimed.id, claimed.token, await execute(claimed));
  assert.equal(store.run(oldRun.id).jobs[0].output.validated, true);
  const newRun = store.start(original.id);
  assert.equal(newRun.workflow_version, 2);
  assert.equal(newRun.jobs.length, 1);
  assert.equal(newRun.definition.steps[0].config.fields.validated, false);
  const revisions = store.revisions(original.id);
  assert.deepEqual(
    revisions.map((r) => r.version),
    [2, 1],
  );
  assert.deepEqual(revisions[1].definition, samples[0]);
});

test('no-op and invalid edits leave the revision history untouched', (t) => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const original = store.createWorkflow(samples[0]);
  assert.equal(store.updateWorkflow(original.id, 1, original).version, 1);
  assert.throws(() => store.updateWorkflow(original.id, 1, { ...original, steps: [] }));
  assert.equal(store.revisions(original.id).length, 1);
  assert.equal(store.updateWorkflow('missing', 1, original), null);
});

test('API requires expectedVersion and rejects stale writes with a recoverable conflict', async (t) => {
  const store = new Store(':memory:');
  const workflow = store.createWorkflow(samples[0]);
  const app = createApp(store);
  t.after(() => app.close());
  const put = (payload) =>
    app.inject({ method: 'PUT', url: '/api/workflows/' + workflow.id, payload });
  assert.equal((await put(workflow)).statusCode, 400);
  assert.equal((await put({ ...workflow, expectedVersion: 1, name: 'Updated' })).statusCode, 200);
  const conflict = await put({ ...workflow, expectedVersion: 1, name: 'Stale overwrite' });
  assert.equal(conflict.statusCode, 409);
  assert.match(conflict.json().error, /version 2/);
  assert.equal((await app.inject('/api/workflows/' + workflow.id)).json().name, 'Updated');
  assert.deepEqual(
    (await app.inject('/api/workflows/' + workflow.id + '/revisions')).json().map((r) => r.version),
    [2, 1],
  );
  assert.equal((await app.inject('/api/workflows/missing/revisions')).statusCode, 404);
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: '/api/workflows/missing',
        payload: { ...workflow, expectedVersion: 1 },
      })
    ).statusCode,
    404,
  );
});

test('v1 migration preserves workflows, run snapshots, jobs and event history across reopen', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskharbor-migration-')),
    path = join(directory, 'queue.db');
  t.after(() => rmSync(directory, { recursive: true }));
  const legacy = new DatabaseSync(path);
  legacy.exec(readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  legacy
    .prepare('INSERT INTO workflows VALUES(?,?,?)')
    .run('workflow', JSON.stringify(samples[0]), 1000);
  legacy
    .prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,NULL)')
    .run('run', 'workflow', JSON.stringify(samples[0]), '{"order":42}', 'queued', 2000);
  legacy
    .prepare('INSERT INTO jobs(id,run_id,step_id,status,available_at) VALUES(?,?,?,?,?)')
    .run('job', 'run', 'validate', 'queued', 2000);
  legacy
    .prepare('INSERT INTO events(run_id,type,message,created_at) VALUES(?,?,?,?)')
    .run('run', 'run.created', 'Legacy run queued', 2000);
  legacy.close();
  for (let i = 0; i < 2; i++) {
    const store = new Store(path);
    try {
      assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 4);
      assert.equal(store.workflow('workflow').version, 1);
      assert.equal(store.revisions('workflow').length, 1);
      const run = store.run('run');
      assert.equal(run.workflow_version, 1);
      assert.equal(run.input.order, 42);
      assert.equal(run.jobs[0].id, 'job');
      assert.equal(run.events[0].message, 'Legacy run queued');
    } finally {
      store.close();
    }
  }
});

test('newer database schemas are rejected without changing their version', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskharbor-future-')),
    path = join(directory, 'queue.db');
  t.after(() => rmSync(directory, { recursive: true }));
  let db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=99');
  db.close();
  assert.throws(() => new Store(path), /Unsupported database version/);
  db = new DatabaseSync(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 99);
  db.close();
});

test('failed migration rolls back added columns and preserves the previous version', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskharbor-rollback-')),
    path = join(directory, 'queue.db');
  t.after(() => rmSync(directory, { recursive: true }));
  let db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE workflow_revisions(existing_marker TEXT)');
  db.close();
  assert.throws(() => new Store(path), /already exists/);
  db = new DatabaseSync(path);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(
      db
        .prepare('PRAGMA table_info(workflows)')
        .all()
        .some((column) => column.name === 'version'),
      false,
    );
    assert.equal(
      db
        .prepare('PRAGMA table_info(runs)')
        .all()
        .some((column) => column.name === 'workflow_version'),
      false,
    );
  } finally {
    db.close();
  }
});

test('concurrent editor processes accept exactly one write for the same base version', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskharbor-edit-')),
    path = join(directory, 'queue.db');
  const store = new Store(path);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true });
  });
  const workflow = store.createWorkflow(samples[0]);
  const edit = (name) =>
    new Promise((resolve, reject) => {
      const script = `import {Store} from './server/store.js';const s=new Store(process.argv[1]);try{const w=s.workflow(process.argv[2]);s.updateWorkflow(w.id,1,{...w,name:process.argv[3]});console.log('saved');}catch(e){if(e.statusCode===409)console.log('conflict');else throw e;}finally{s.close();}`;
      const child = spawn(process.execPath, [
        '--input-type=module',
        '-e',
        script,
        path,
        workflow.id,
        name,
      ]);
      let output = '',
        error = '';
      child.stdout.on('data', (x) => (output += x));
      child.stderr.on('data', (x) => (error += x));
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error))));
    });
  const results = await Promise.all([edit('Editor A'), edit('Editor B')]);
  assert.deepEqual(results.sort(), ['conflict', 'saved']);
  assert.equal(store.workflow(workflow.id).version, 2);
  assert.equal(store.revisions(workflow.id).length, 2);
});
