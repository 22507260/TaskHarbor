import type { Step } from './types';

export function layoutGraph(steps: Pick<Step, 'id' | 'dependsOn'>[]) {
  const depths = new Map<string, number>();
  const remaining = new Map(steps.map((step) => [step.id, step]));
  if (remaining.size !== steps.length) throw new Error('Duplicate graph node');
  while (remaining.size) {
    let changed = false;
    for (const [id, step] of remaining) {
      if (step.dependsOn.every((dep) => depths.has(dep))) {
        depths.set(
          id,
          step.dependsOn.length
            ? Math.max(...step.dependsOn.map((dep) => depths.get(dep)!)) + 1
            : 0,
        );
        remaining.delete(id);
        changed = true;
      }
    }
    if (!changed) throw new Error('Graph contains a cycle or missing dependency');
  }
  const columns = Array.from({ length: Math.max(0, ...depths.values()) + 1 }, (_, depth) =>
    steps.filter((step) => depths.get(step.id) === depth),
  );
  const rows = Math.max(1, ...columns.map((column) => column.length));
  const width = columns.length * 220 + 24,
    height = rows * 96 + 24;
  const nodes = steps.map((step) => {
    const column = columns[depths.get(step.id)!];
    return {
      id: step.id,
      x: 16 + depths.get(step.id)! * 220,
      y: 16 + column.indexOf(step) * 96 + (rows - column.length) * 48,
    };
  });
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const edges = steps.flatMap((step) =>
    step.dependsOn.map((dependency) => {
      const from = positions.get(dependency)!,
        to = positions.get(step.id)!;
      return {
        from: dependency,
        to: step.id,
        path: `M ${from.x + 184} ${from.y + 36} C ${from.x + 208} ${from.y + 36}, ${to.x - 24} ${to.y + 36}, ${to.x} ${to.y + 36}`,
      };
    }),
  );
  return { width, height, nodes, edges };
}
