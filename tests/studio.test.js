import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialize,
  addStep,
  connect,
  disconnect,
  removeStep,
  reorder,
  timeline,
  commit,
  undo,
  redo,
  validate,
  readDraft,
  writeDraft,
  clearDraft,
  draftKey,
} from '../src/studioModel.ts';
import { samples, workflowSchema } from '../server/definition.js';
function three() {
  return ['transform', 'delay', 'checkpoint'].reduce((s, type) => addStep(s, type), initialize());
}
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
test('studio connections use target dependencies and reject self, duplicates, cycles and missing nodes', () => {
  const state = three(),
    before = structuredClone(state);
  const connected = connect(connect(state, 'step_1', 'step_2'), 'step_2', 'step_3');
  assert.deepEqual(connected.definition.steps[1].dependsOn, ['step_1']);
  assert.throws(() => connect(connected, 'step_3', 'step_1'), /cycle/);
  assert.throws(() => connect(connected, 'step_1', 'step_1'), /itself/);
  assert.throws(() => connect(connected, 'step_1', 'step_2'), /already/);
  assert.throws(() => connect(connected, 'missing', 'step_2'));
  assert.deepEqual(state, before);
});
test('deletion cleans dependencies, raw fields and positions; an empty graph cannot be saved', () => {
  let state = connect(three(), 'step_1', 'step_3');
  state.raw.step_1 = '{broken';
  state = removeStep(state, 'step_1');
  assert.deepEqual(state.definition.steps[1].dependsOn, []);
  assert.equal(state.raw.step_1, undefined);
  assert.equal(state.positions.step_1, undefined);
  for (const step of state.definition.steps) state = removeStep(state, step.id);
  assert.ok(validate(state).errors.length);
});
test('dependencies retain merge order through reordering and disconnection', () => {
  let state = connect(connect(three(), 'step_1', 'step_3'), 'step_2', 'step_3');
  state = reorder(state, 'step_3', 1, -1);
  assert.deepEqual(state.definition.steps[2].dependsOn, ['step_2', 'step_1']);
  state = disconnect(state, 'step_2', 'step_3');
  assert.deepEqual(state.definition.steps[2].dependsOn, ['step_1']);
});
test('step IDs avoid collisions and task count is bounded at twenty', () => {
  let state = three();
  state = removeStep(state, 'step_2');
  state = addStep(state, 'delay');
  assert.equal(new Set(state.definition.steps.map((s) => s.id)).size, 3);
  while (state.definition.steps.length < 20) state = addStep(state, 'delay');
  assert.throws(() => addStep(state, 'delay'), /20/);
});
test('undo and redo group edits, cap history at one hundred and clear redo on branching', () => {
  let h = timeline(initialize());
  const before = h.present;
  let next = addStep(before, 'delay');
  next.definition.name = 'Grouped';
  h = commit(h, next, before);
  assert.equal(h.past.length, 1);
  assert.deepEqual(undo(h).present.definition, before.definition);
  assert.deepEqual(redo(undo(h)).present.definition, next.definition);
  assert.equal(commit(undo(h), addStep(before, 'transform')).future.length, 0);
  for (let i = 0; i < 120; i++)
    h = commit(h, { ...h.present, definition: { ...h.present.definition, name: String(i) } });
  assert.equal(h.past.length, 100);
});
test('studio and server share validation, including primitive JSON fields and bounded task settings', () => {
  for (const sample of samples)
    assert.deepEqual(validate(initialize(sample)).definition, workflowSchema.parse(sample));
  const state = initialize(samples[0]);
  state.raw.validate = '{bad';
  assert.equal(validate(state).errors[0].step, 'validate');
  state.raw.validate = '{"nested":{}}';
  assert.ok(validate(state).errors.some((e) => e.step === 'validate'));
  state.raw.validate = '{"ready":true,"empty":null}';
  assert.equal(validate(state).definition.steps[0].config.fields.ready, true);
});
test('drafts preserve raw invalid JSON, positions, viewport and original revision across reopen', () => {
  const store = memory(),
    state = initialize(samples[0]);
  state.raw.validate = '{unfinished';
  state.viewport.zoom = 1.7;
  const draft = { formatVersion: 1, sourceId: 'workflow', baseVersion: 1, state };
  assert.equal(writeDraft(store, 'key', draft), null);
  assert.deepEqual(readDraft(store, 'key').draft, draft);
  assert.equal(readDraft(store, 'key').draft.baseVersion, 1);
  assert.equal(clearDraft(store, 'key'), null);
  assert.equal(readDraft(store, 'key').draft, null);
});
test('corrupt draft envelopes, unsafe positions and invalid graph references are rejected', () => {
  const store = memory();
  for (const text of ['{bad', '{}', JSON.stringify({ formatVersion: 2 }), 'x'.repeat(1000001)]) {
    store.setItem('key', text);
    assert.ok(readDraft(store, 'key').error);
  }
  const draft = { formatVersion: 1, sourceId: null, baseVersion: null, state: three() };
  draft.state.definition.steps[0].dependsOn = ['missing'];
  writeDraft(store, 'key', draft);
  assert.ok(readDraft(store, 'key').error);
  draft.state.definition.steps[0].dependsOn = [];
  draft.state.viewport.zoom = 100;
  writeDraft(store, 'key', draft);
  assert.ok(readDraft(store, 'key').error);
});
test('storage denial is reported without throwing or modifying the live editor state', () => {
  const broken = {
    getItem() {
      throw new Error();
    },
    setItem() {
      throw new Error();
    },
    removeItem() {
      throw new Error();
    },
  };
  const draft = { formatVersion: 1, sourceId: null, baseVersion: null, state: three() },
    before = structuredClone(draft);
  assert.ok(readDraft(broken, 'key').error);
  assert.ok(writeDraft(broken, 'key', draft));
  assert.ok(clearDraft(broken, 'key'));
  assert.deepEqual(draft, before);
});
test('new, edit and historical copy drafts have distinct source keys', () => {
  assert.equal(
    new Set([
      draftKey(),
      draftKey('a'),
      draftKey('b'),
      draftKey('a', 1, true),
      draftKey('a', 2, true),
    ]).size,
    5,
  );
});
test('camera changes remain outside undo and redo history', () => {
  let h = timeline(initialize());
  h = commit(h, addStep(h.present, 'delay'));
  h = { ...h, present: { ...h.present, viewport: { x: 20, y: 40, zoom: 2 } } };
  assert.deepEqual(undo(h).present.viewport, h.present.viewport);
  assert.deepEqual(redo(undo(h)).present.viewport, h.present.viewport);
});
