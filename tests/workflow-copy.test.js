import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowCopy } from '../src/workflowCopy.ts';
import { Store } from '../server/store.js';
import { samples } from '../server/definition.js';
test('copy drafts exclude source identity and deeply isolate the historical definition', () => {
  const revision = {
    version: 2,
    created_at: 1,
    definition: { ...samples[0], id: 'source', version: 99 },
  };
  const before = structuredClone(revision);
  const copy = workflowCopy(revision);
  assert.deepEqual(Object.keys(copy).sort(), ['description', 'name', 'steps']);
  assert.ok(copy.name.endsWith('(v2 copy)'));
  copy.steps[0].dependsOn.push('changed');
  copy.steps[0].config.fields = { altered: true };
  assert.deepEqual(revision, before);
  assert.equal(
    workflowCopy({ ...revision, definition: { ...revision.definition, name: 'x'.repeat(80) } }).name
      .length,
    80,
  );
});
test('saving an old revision copy creates a fresh version-one workflow without changing source or runs', () => {
  const store = new Store(':memory:');
  try {
    const source = store.createWorkflow(samples[0]);
    const run = store.start(source.id);
    store.updateWorkflow(source.id, 1, { ...samples[0], name: 'Latest changed name' });
    const revision = store.revisions(source.id).find((r) => r.version === 1);
    const before = store.run(run.id);
    const copy = store.createWorkflow(workflowCopy(revision));
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.version, 1);
    assert.deepEqual(copy.steps, revision.definition.steps);
    assert.equal(store.workflow(source.id).version, 2);
    assert.equal(store.revisions(source.id).length, 2);
    assert.equal(store.revisions(copy.id).length, 1);
    assert.deepEqual(store.run(run.id), before);
    assert.equal(store.runs().length, 1);
  } finally {
    store.close();
  }
});
