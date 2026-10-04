import { z } from 'zod';
import { workflowSchema } from '../server/definition.js';
import { layoutGraph } from './graph.ts';
import type { Step, Workflow } from './types';

export type Definition = Omit<Workflow, 'id' | 'version'>;
export type Position = { x: number; y: number };
export type StudioState = {
  definition: Definition;
  raw: Record<string, string>;
  positions: Record<string, Position>;
  viewport: { x: number; y: number; zoom: number };
};
export type Timeline = { past: StudioState[]; present: StudioState; future: StudioState[] };
export function arrange(steps: Step[]) {
  return Object.fromEntries(
    layoutGraph(steps).nodes.map(({ id, x, y }) => [id, { x, y: y * 1.4 }]),
  );
}
export function initialize(definition?: Definition): StudioState {
  const value = structuredClone(
    definition ? workflowSchema.parse(definition) : { name: '', description: '', steps: [] },
  );
  return {
    definition: value,
    raw: {},
    positions: arrange(value.steps),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
export function timeline(present: StudioState): Timeline {
  return { past: [], present, future: [] };
}
const same = (a: StudioState, b: StudioState) =>
  JSON.stringify({ definition: a.definition, raw: a.raw, positions: a.positions }) ===
  JSON.stringify({ definition: b.definition, raw: b.raw, positions: b.positions });
export function commit(history: Timeline, next: StudioState, before = history.present): Timeline {
  if (same(before, next)) return { ...history, present: next };
  return { past: [...history.past, before].slice(-100), present: next, future: [] };
}
export function undo(history: Timeline): Timeline {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: { ...history.past.at(-1)!, viewport: history.present.viewport },
    future: [history.present, ...history.future],
  };
}
export function redo(history: Timeline): Timeline {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: { ...history.future[0], viewport: history.present.viewport },
    future: history.future.slice(1),
  };
}
export function addStep(state: StudioState, type: Step['type'], position?: Position): StudioState {
  if (state.definition.steps.length >= 20)
    throw new Error('A workflow can contain at most 20 steps.');
  let suffix = 1;
  while (state.definition.steps.some((s) => s.id === `step_${suffix}`)) suffix++;
  const id = `step_${suffix}`;
  const step: Step = {
    id,
    name: { transform: 'JSON transform', delay: 'Delay', checkpoint: 'Retry checkpoint' }[type],
    type,
    dependsOn: [],
    config: type === 'transform' ? { fields: {} } : { delayMs: 1000, failUntilAttempt: 0 },
    maxAttempts: 3,
  };
  return {
    ...state,
    definition: { ...state.definition, steps: [...state.definition.steps, step] },
    positions: {
      ...state.positions,
      [id]: position ?? { x: 40 + (suffix % 4) * 230, y: 40 + Math.floor(suffix / 4) * 130 },
    },
  };
}
export function duplicateStep(state: StudioState, sourceId: string): StudioState {
  const source = state.definition.steps.find((step) => step.id === sourceId);
  if (!source) throw new Error('Select an existing step to duplicate.');
  const origin = state.positions[sourceId] ?? { x: 0, y: 0 };
  const next = addStep(state, source.type, { x: origin.x + 40, y: origin.y + 40 });
  const id = next.definition.steps.at(-1)!.id;
  const copy = { ...structuredClone(source), id, name: source.name.slice(0, 73) + ' (copy)' };
  return {
    ...next,
    definition: { ...next.definition, steps: [...state.definition.steps, copy] },
    raw: Object.hasOwn(state.raw, sourceId)
      ? { ...state.raw, [id]: state.raw[sourceId] }
      : { ...state.raw },
  };
}
export function removeStep(state: StudioState, id: string): StudioState {
  const positions = { ...state.positions },
    raw = { ...state.raw };
  delete positions[id];
  delete raw[id];
  return {
    ...state,
    positions,
    raw,
    definition: {
      ...state.definition,
      steps: state.definition.steps
        .filter((s) => s.id !== id)
        .map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d !== id) })),
    },
  };
}
export function connect(state: StudioState, source: string, target: string): StudioState {
  const steps = state.definition.steps;
  const destination = steps.find((s) => s.id === target);
  if (!destination || !steps.some((s) => s.id === source))
    throw new Error('Select existing steps to connect.');
  if (source === target) throw new Error('A step cannot depend on itself.');
  if (destination.dependsOn.includes(source)) throw new Error('This connection already exists.');
  const reaches = (id: string, seen = new Set<string>()): boolean => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (steps.find((s) => s.id === id)?.dependsOn ?? []).some((d) => reaches(d, seen));
  };
  if (reaches(source)) throw new Error('This connection would create a cycle.');
  return {
    ...state,
    definition: {
      ...state.definition,
      steps: steps.map((s) =>
        s.id === target ? { ...s, dependsOn: [...s.dependsOn, source] } : s,
      ),
    },
  };
}
export function disconnect(state: StudioState, source: string, target: string): StudioState {
  return {
    ...state,
    definition: {
      ...state.definition,
      steps: state.definition.steps.map((s) =>
        s.id === target ? { ...s, dependsOn: s.dependsOn.filter((d) => d !== source) } : s,
      ),
    },
  };
}
export function reorder(
  state: StudioState,
  id: string,
  index: number,
  direction: -1 | 1,
): StudioState {
  return {
    ...state,
    definition: {
      ...state.definition,
      steps: state.definition.steps.map((s) => {
        if (s.id !== id || index + direction < 0 || index + direction >= s.dependsOn.length)
          return s;
        const dependsOn = [...s.dependsOn];
        [dependsOn[index], dependsOn[index + direction]] = [
          dependsOn[index + direction],
          dependsOn[index],
        ];
        return { ...s, dependsOn };
      }),
    },
  };
}
export function validate(state: StudioState): {
  definition?: Definition;
  errors: { step?: string; message: string }[];
} {
  const errors: { step?: string; message: string }[] = [];
  const steps = state.definition.steps.map((step) => {
    if (step.type !== 'transform') return step;
    try {
      const fields = JSON.parse(state.raw[step.id] ?? JSON.stringify(step.config.fields ?? {}));
      if (!fields || Array.isArray(fields) || typeof fields !== 'object') throw new Error();
      return { ...step, config: { fields } };
    } catch {
      errors.push({ step: step.id, message: 'Fields must be a valid JSON object.' });
      return step;
    }
  });
  const parsed = workflowSchema.safeParse({ ...state.definition, steps });
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const index =
        issue.path[0] === 'steps' && typeof issue.path[1] === 'number' ? issue.path[1] : undefined;
      errors.push({
        step: index === undefined ? undefined : steps[index]?.id,
        message: issue.message,
      });
    }
  return errors.length || !parsed.success ? { errors } : { definition: parsed.data, errors };
}

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const stateSchema = z.object({
  definition: z.object({
    name: z.string().max(10000),
    description: z.string().max(10000),
    steps: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
          name: z.string(),
          type: z.enum(['transform', 'delay', 'checkpoint']),
          dependsOn: z.array(z.string()).max(20),
          config: z.object({
            fields: z.record(z.string(), z.unknown()).optional(),
            delayMs: z.number().finite().optional(),
            failUntilAttempt: z.number().finite().optional(),
          }),
          maxAttempts: z.number().finite().optional(),
        }),
      )
      .max(20),
  }),
  raw: z.record(z.string(), z.string()),
  positions: z.record(z.string(), positionSchema),
  viewport: positionSchema.extend({ zoom: z.number().min(0.1).max(4) }),
});
export type Draft = {
  formatVersion: 1;
  sourceId: string | null;
  baseVersion: number | null;
  state: StudioState;
};
const draftSchema = z.object({
  formatVersion: z.literal(1),
  sourceId: z.string().nullable(),
  baseVersion: z.number().int().positive().nullable(),
  state: stateSchema,
});
export type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readDraft(storage: Storage, key: string): { draft: Draft | null; error?: string } {
  try {
    const text = storage.getItem(key);
    if (!text) return { draft: null };
    if (text.length > 1000000) throw new Error();
    const draft = draftSchema.parse(JSON.parse(text));
    const ids = new Set(draft.state.definition.steps.map((s) => s.id));
    if (
      ids.size !== draft.state.definition.steps.length ||
      draft.state.definition.steps.some((s) => s.dependsOn.some((d) => !ids.has(d)))
    )
      throw new Error();
    arrange(draft.state.definition.steps);
    return { draft };
  } catch {
    return {
      draft: null,
      error: 'The saved draft could not be read. You can discard it and continue.',
    };
  }
}
export function writeDraft(storage: Storage, key: string, draft: Draft): string | null {
  try {
    storage.setItem(key, JSON.stringify(draft));
    return null;
  } catch {
    return 'Draft could not be saved in this browser. Keep the editor open or save the workflow.';
  }
}
export function clearDraft(storage: Storage, key: string): string | null {
  try {
    storage.removeItem(key);
    return null;
  } catch {
    return 'Saved workflow, but the local draft could not be removed.';
  }
}
export function draftKey(sourceId?: string, version?: number, copy = false) {
  return `taskharbor:studio:v1:${copy ? `copy:${sourceId}:${version}` : sourceId ? `edit:${sourceId}` : 'new'}`;
}
