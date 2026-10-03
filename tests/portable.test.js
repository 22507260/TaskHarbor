import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { samples } from '../server/definition.js';
import { exportWorkflow } from '../server/portable.js';

function setup(t) {
  const store = new Store(':memory:');
  const app = createApp(store);
  t.after(() => app.close());
  return { store, app };
}
test('export/import roundtrip preserves all sample graphs without identity or execution data', async (t) => {
  const { store, app } = setup(t);
  for (const sample of samples) {
    const original = store.createWorkflow(sample);
    const run = store.start(original.id, { privatePayload: 'excluded' });
    const response = await app.inject(`/api/workflows/${original.id}/export`);
    assert.equal(response.statusCode, 200);
    const document = response.json();
    assert.deepEqual(Object.keys(document), ['format', 'formatVersion', 'workflow']);
    assert.deepEqual(document.workflow, sample);
    assert.equal(JSON.stringify(document).includes('privatePayload'), false);
    const imported = await app.inject({
      method: 'POST',
      url: '/api/workflow-imports',
      payload: document,
    });
    assert.equal(imported.statusCode, 201);
    const copy = imported.json();
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.version, 1);
    assert.deepEqual(exportWorkflow(copy), document);
    assert.equal(store.revisions(copy.id).length, 1);
    assert.equal(store.runs().length, samples.indexOf(sample) + 1);
    assert.equal(store.run(run.id).workflow_id, original.id);
  }
});
test('preview normalizes defaults without writing; export selects latest revision', async (t) => {
  const { store, app } = setup(t);
  const draft = {
    format: 'taskharbor.workflow',
    formatVersion: 1,
    workflow: { name: '  Minimal  ', steps: [{ id: 'first', name: 'First', type: 'transform' }] },
  };
  const preview = await app.inject({
    method: 'POST',
    url: '/api/workflow-imports/preview',
    payload: draft,
  });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().workflow.name, 'Minimal');
  assert.deepEqual(preview.json().workflow.steps[0].dependsOn, []);
  assert.equal(preview.json().workflow.steps[0].maxAttempts, 3);
  assert.equal(store.workflows().length, 0);
  const original = store.createWorkflow(samples[0]);
  const revised = store.updateWorkflow(original.id, 1, {
    ...samples[0],
    name: 'Latest definition',
  });
  const exported = (await app.inject(`/api/workflows/${original.id}/export`)).json();
  assert.equal(exported.workflow.name, revised.name);
  assert.equal((await app.inject('/api/workflows/missing/export')).statusCode, 404);
});
test('invalid portable documents are rejected by preview and creation without partial writes', async (t) => {
  const { store, app } = setup(t);
  const base = exportWorkflow(samples[0]);
  const cases = [
    { ...base, formatVersion: 2 },
    { ...base, format: 'other' },
    { ...base, runs: [] },
    { ...base, workflow: { ...base.workflow, id: 'foreign' } },
    { ...base, workflow: { ...base.workflow, steps: [] } },
    {
      ...base,
      workflow: { ...base.workflow, steps: [{ ...base.workflow.steps[0], type: 'shell' }] },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        steps: [{ ...base.workflow.steps[0], dependsOn: ['missing'] }],
      },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        steps: [{ ...base.workflow.steps[0], dependsOn: ['validate'] }],
      },
    },
    {
      ...base,
      workflow: { ...base.workflow, steps: [base.workflow.steps[0], base.workflow.steps[0]] },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        steps: [{ ...base.workflow.steps[0], script: 'do something' }],
      },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        steps: [{ ...base.workflow.steps[0], config: { unknown: true } }],
      },
    },
    {
      ...base,
      workflow: {
        ...base.workflow,
        steps: [{ ...base.workflow.steps[0], config: { delayMs: 15001 } }],
      },
    },
  ];
  for (const payload of cases)
    for (const url of ['/api/workflow-imports/preview', '/api/workflow-imports']) {
      const response = await app.inject({ method: 'POST', url, payload });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
    }
  assert.equal(store.workflows().length, 0);
  assert.equal(store.runs().length, 0);
});
test('portable API enforces body size, malformed JSON and origin guards', async (t) => {
  const { store, app } = setup(t);
  const url = '/api/workflow-imports';
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        payload: 'x'.repeat(65537),
        headers: { 'content-type': 'application/json' },
      })
    ).statusCode,
    413,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        payload: '{bad',
        headers: { 'content-type': 'application/json' },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        payload: exportWorkflow(samples[0]),
        headers: { origin: 'https://unrelated.example' },
      })
    ).statusCode,
    403,
  );
  assert.equal(store.workflows().length, 0);
});
