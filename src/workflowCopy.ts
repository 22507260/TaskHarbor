import type { Revision } from './types';
export function workflowCopy(revision: Revision): Revision['definition'] {
  const source = revision.definition;
  const suffix = ` (v${revision.version} copy)`;
  return {
    name: source.name.slice(0, 80 - suffix.length) + suffix,
    description: source.description,
    steps: structuredClone(source.steps),
  };
}
