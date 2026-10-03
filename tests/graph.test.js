import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from '../src/graph.ts';

test('execution graph places dependencies before unsorted descendants and keeps branch nodes separate', () => {
  const steps = [
    { id: 'finish', dependsOn: ['left', 'right'] },
    { id: 'right', dependsOn: ['entry'] },
    { id: 'entry', dependsOn: [] },
    { id: 'left', dependsOn: ['entry'] },
  ];
  const graph = layoutGraph(steps),
    positions = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.equal(graph.edges.length, 4);
  for (const edge of graph.edges) {
    assert.ok(positions.get(edge.from).x + 184 < positions.get(edge.to).x);
    assert.ok(edge.path.startsWith('M '));
  }
  assert.equal(positions.get('left').x, positions.get('right').x);
  assert.ok(Math.abs(positions.get('left').y - positions.get('right').y) >= 96);
  assert.equal(positions.get('entry').y, positions.get('finish').y);
  assert.deepEqual(layoutGraph(steps), graph);
});
test('maximum-depth and maximum-width graphs fit their canvas without overlapping nodes', () => {
  const cases = [
    Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, dependsOn: i ? ['s' + (i - 1)] : [] })),
    Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, dependsOn: [] })),
  ];
  for (const steps of cases) {
    const graph = layoutGraph(steps);
    assert.equal(graph.nodes.length, 20);
    for (const node of graph.nodes) {
      assert.ok(node.x >= 0 && node.x + 184 <= graph.width);
      assert.ok(node.y >= 0 && node.y + 72 <= graph.height);
      for (const other of graph.nodes.filter((n) => n.id !== node.id))
        assert.ok(
          node.x + 184 <= other.x ||
            other.x + 184 <= node.x ||
            node.y + 72 <= other.y ||
            other.y + 72 <= node.y,
        );
    }
  }
});
test('graph rejects cycles, missing dependencies and duplicate node identities instead of hanging', () => {
  assert.throws(
    () =>
      layoutGraph([
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
      ]),
    /cycle/,
  );
  assert.throws(() => layoutGraph([{ id: 'a', dependsOn: ['missing'] }]), /missing/);
  assert.throws(
    () =>
      layoutGraph([
        { id: 'a', dependsOn: [] },
        { id: 'a', dependsOn: [] },
      ]),
    /Duplicate/,
  );
});
