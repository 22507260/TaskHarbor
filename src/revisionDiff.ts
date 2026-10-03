import type { Revision, Step } from './types';

export type FieldChange = { path: string[]; before: unknown; after: unknown };
type Definition = Revision['definition'];
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
    );
  }
  return false;
}
function fields(before: unknown, after: unknown, path: string[] = []): FieldChange[] {
  if (equal(before, after)) return [];
  if (
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>,
      right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .flatMap((key) =>
        fields(
          Object.hasOwn(left, key) ? left[key] : undefined,
          Object.hasOwn(right, key) ? right[key] : undefined,
          [...path, key],
        ),
      );
  }
  return [{ path, before, after }];
}
export function compareRevisions(before: Definition, after: Definition) {
  const left = new Map(before.steps.map((step) => [step.id, step])),
    right = new Map(after.steps.map((step) => [step.id, step]));
  const added = after.steps.filter((step) => !left.has(step.id)),
    removed = before.steps.filter((step) => !right.has(step.id));
  const changed: { before: Step; after: Step; fields: FieldChange[] }[] = [];
  for (const step of after.steps) {
    const original = left.get(step.id);
    if (!original) continue;
    const changes = fields(original, step);
    if (changes.length) changed.push({ before: original, after: step, fields: changes });
  }
  const metadata = fields(
    { name: before.name, description: before.description },
    { name: after.name, description: after.description },
  );
  const oldOrder = before.steps.map((step) => step.id),
    newOrder = after.steps.map((step) => step.id);
  return {
    added,
    removed,
    changed,
    metadata,
    orderChanged: !equal(oldOrder, newOrder),
    oldOrder,
    newOrder,
  };
}
