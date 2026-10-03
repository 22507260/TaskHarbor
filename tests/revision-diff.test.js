import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRevisions } from '../src/revisionDiff.ts';
const step = (id, extra = {}) => ({
  id,
  name: id,
  type: 'transform',
  dependsOn: [],
  maxAttempts: 3,
  config: { fields: {}, delayMs: 500, failUntilAttempt: 0 },
  ...extra,
});
const definition = (steps) => ({ name: 'Example', description: '', steps });

test('revision comparison identifies additions, removals, modifications and workflow metadata without mutating snapshots', () => {
  const before = definition([step('keep'), step('remove')]);
  const after = {
    ...definition([step('keep', { name: 'Renamed', maxAttempts: 5 }), step('add')]),
    description: 'Revised',
  };
  const snapshot = JSON.stringify({ before, after }),
    diff = compareRevisions(before, after);
  assert.deepEqual(
    diff.added.map((s) => s.id),
    ['add'],
  );
  assert.deepEqual(
    diff.removed.map((s) => s.id),
    ['remove'],
  );
  assert.deepEqual(
    diff.changed.map((s) => s.after.id),
    ['keep'],
  );
  assert.deepEqual(
    diff.changed[0].fields.map((f) => f.path),
    [['maxAttempts'], ['name']],
  );
  assert.deepEqual(diff.metadata, [{ path: ['description'], before: '', after: 'Revised' }]);
  assert.equal(diff.orderChanged, true);
  assert.equal(JSON.stringify({ before, after }), snapshot);
});
test('object key order is ignored while dependency order and step sequence remain visible', () => {
  const before = definition([
    step('a'),
    step('b'),
    step('c', { dependsOn: ['a', 'b'], config: { fields: { alpha: 1, beta: 2 } } }),
  ]);
  const reorderedKeys = structuredClone(before);
  reorderedKeys.steps[2].config.fields = { beta: 2, alpha: 1 };
  assert.deepEqual(compareRevisions(before, reorderedKeys).changed, []);
  const reversedDependencies = structuredClone(before);
  reversedDependencies.steps[2].dependsOn.reverse();
  const diff = compareRevisions(before, reversedDependencies);
  assert.deepEqual(diff.changed[0].fields, [
    { path: ['dependsOn'], before: ['a', 'b'], after: ['b', 'a'] },
  ]);
  assert.equal(diff.orderChanged, false);
  const reversedSteps = { ...before, steps: [...before.steps].reverse() };
  assert.equal(compareRevisions(before, reversedSteps).orderChanged, true);
  assert.deepEqual(compareRevisions(before, reversedSteps).changed, []);
});
test('config field diff distinguishes deletion, null, false, zero and dotted keys', () => {
  const before = definition([
    step('a', {
      config: {
        fields: { deleted: true, nullable: null, flag: false, 'a.b': 0 },
        delayMs: 500,
        failUntilAttempt: 0,
      },
    }),
  ]);
  const after = definition([
    step('a', {
      config: {
        fields: { nullable: false, flag: true, 'a.b': 1, added: null },
        delayMs: 900,
        failUntilAttempt: 2,
      },
    }),
  ]);
  const changes = compareRevisions(before, after).changed[0].fields;
  assert.ok(
    changes.some(
      (f) =>
        JSON.stringify(f.path) === '["config","fields","a.b"]' && f.before === 0 && f.after === 1,
    ),
  );
  assert.ok(
    changes.some((f) => f.path.at(-1) === 'deleted' && f.before === true && f.after === undefined),
  );
  assert.ok(
    changes.some((f) => f.path.at(-1) === 'added' && f.before === undefined && f.after === null),
  );
  assert.ok(
    changes.some((f) => f.path.at(-1) === 'nullable' && f.before === null && f.after === false),
  );
  assert.equal(changes.length, 7);
});
test('reverse comparison inverts before/after and rename of identity is addition/removal', () => {
  const before = definition([step('old')]),
    after = definition([step('new')]);
  const forward = compareRevisions(before, after),
    reverse = compareRevisions(after, before);
  assert.deepEqual(forward.added, reverse.removed);
  assert.deepEqual(forward.removed, reverse.added);
  assert.deepEqual(forward.changed, []);
  const same = compareRevisions(before, before);
  assert.deepEqual(same.metadata, []);
  assert.deepEqual(same.changed, []);
  assert.deepEqual(same.added, []);
  assert.deepEqual(same.removed, []);
  assert.equal(same.orderChanged, false);
});
