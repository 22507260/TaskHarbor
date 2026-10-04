import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useReactFlow,
  type NodeProps,
  type Node,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Undo2, Redo2, LayoutGrid, Trash2, GitBranch, Layers3 } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Workflow, Step } from '../types';
import {
  initialize,
  timeline,
  commit,
  undo,
  redo,
  addStep,
  removeStep,
  connect,
  disconnect,
  reorder,
  arrange,
  validate,
  readDraft,
  writeDraft,
  clearDraft,
  draftKey,
  type StudioState,
  type Definition,
  type Storage,
} from '../studioModel';
import Dialog from './Dialog';
const storage: Storage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
type CopyDraft = { definition: Definition; version: number; sourceId: string };
type Props = {
  close: () => void;
  created: () => Promise<void>;
  initial: Workflow | null;
  copy?: CopyDraft | null;
};
type TaskNode = Node<
  { label: string; kind: string; invalid: boolean; dependencies: number },
  'task'
>;
function TaskCard({ data, selected }: NodeProps<TaskNode>) {
  return (
    <div className={`studio-node ${selected ? 'selected' : ''} ${data.invalid ? 'invalid' : ''}`}>
      <Handle type="target" position={Position.Left} aria-label="Dependency input" />
      <small>
        <GitBranch size={13} /> {data.kind}
      </small>
      <strong>{data.label || 'Unnamed step'}</strong>
      <span>
        {data.dependencies} dependencies{data.invalid ? ' · Needs attention' : ''}
      </span>
      <Handle type="source" position={Position.Right} aria-label="Step output" />
    </div>
  );
}
const nodeTypes = { task: TaskCard };
const taskNames = { transform: 'JSON transform', delay: 'Delay', checkpoint: 'Retry checkpoint' };
export default function Builder(props: Props) {
  return (
    <ReactFlowProvider>
      <Studio {...props} />
    </ReactFlowProvider>
  );
}
function Studio({ close, created, initial, copy }: Props) {
  const key = draftKey(initial?.id ?? copy?.sourceId, copy?.version, !!copy);
  const [seed] = useState(() => {
    const state = initialize(initial ?? copy?.definition);
    if (initial) {
      try {
        const layout = JSON.parse(storage.getItem(`taskharbor:layout:${initial.id}`) ?? 'null');
        if (layout?.positions)
          for (const step of state.definition.steps) {
            const p = layout.positions[step.id];
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) state.positions[step.id] = p;
          }
        if (
          layout?.viewport &&
          Number.isFinite(layout.viewport.x) &&
          Number.isFinite(layout.viewport.y) &&
          layout.viewport.zoom >= 0.1 &&
          layout.viewport.zoom <= 4
        )
          state.viewport = layout.viewport;
      } catch {
        /* Corrupt presentation data uses automatic layout. */
      }
    }
    return state;
  });
  const [history, setHistory] = useState(() => timeline(seed));
  const state = history.present;
  const group = useRef<StudioState | null>(null);
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(state.definition.steps[0]?.id ?? null);
  const [pending, setPending] = useState(() => readDraft(storage, key));
  const [baseVersion, setBaseVersion] = useState(initial?.version ?? copy?.version ?? null);
  const [error, setError] = useState(''),
    [storageError, setStorageError] = useState(''),
    [status, setStatus] = useState('Ready'),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [conflict, setConflict] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'palette' | 'settings'>('settings');
  const baseline = useRef(JSON.stringify(seed));
  const clean = useRef(false);
  const flow = useReactFlow<TaskNode>();
  const validation = useMemo(() => validate(state), [state]);
  const step = state.definition.steps.find((s) => s.id === selected);
  const waiting = !!pending.draft || !!pending.error;
  const dirty = JSON.stringify(state) !== baseline.current;
  function change(action: (state: StudioState) => StudioState) {
    finish();
    setError('');
    setHistory((h) => {
      try {
        return commit(h, action(h.present));
      } catch (e) {
        setError((e as Error).message);
        return h;
      }
    });
  }
  function begin() {
    if (!group.current) group.current = state;
  }
  function transient(action: (state: StudioState) => StudioState) {
    setHistory((h) => ({ ...h, present: action(h.present) }));
  }
  function finish() {
    const before = group.current;
    group.current = null;
    if (before) setHistory((h) => commit(h, h.present, before));
  }
  function patch(patch: Partial<Step>) {
    transient((s) => ({
      ...s,
      definition: {
        ...s.definition,
        steps: s.definition.steps.map((x) => (x.id === selected ? { ...x, ...patch } : x)),
      },
    }));
  }
  function add(type: Step['type'], position?: { x: number; y: number }) {
    finish();
    setError('');
    setHistory((h) => {
      try {
        const next = addStep(h.present, type, position);
        setSelected(next.definition.steps.at(-1)!.id);
        setMobilePanel('settings');
        return commit(h, next);
      } catch (e) {
        setError((e as Error).message);
        return h;
      }
    });
  }
  useEffect(() => {
    if (waiting || clean.current || !dirty) return;
    setStatus('Saving draft…');
    const timer = setTimeout(() => {
      const message = writeDraft(storage, key, {
        formatVersion: 1,
        sourceId: initial?.id ?? copy?.sourceId ?? null,
        baseVersion,
        state,
      });
      setStorageError(message ?? '');
      setStatus(message ? 'Draft not stored' : 'Draft saved locally');
    }, 500);
    return () => clearTimeout(timer);
  }, [state, waiting, dirty, key, baseVersion, initial?.id, copy?.sourceId]);
  const latest = useRef({ state, waiting, dirty, baseVersion });
  latest.current = { state, waiting, dirty, baseVersion };
  useEffect(
    () => () => {
      const value = latest.current;
      if (!clean.current && !value.waiting && value.dirty)
        writeDraft(storage, key, {
          formatVersion: 1,
          sourceId: initial?.id ?? copy?.sourceId ?? null,
          baseVersion: value.baseVersion,
          state: value.state,
        });
    },
    [key, initial?.id, copy?.sourceId],
  );
  async function save(asNew = false) {
    finish();
    setError('');
    if (!validation.definition) {
      setError('Fix the highlighted fields before saving.');
      return;
    }
    setBusy(true);
    let saved: Workflow;
    try {
      saved = await api<Workflow>(
        initial && !asNew ? '/workflows/' + initial.id : '/workflows',
        {
          ...validation.definition,
          ...(initial && !asNew ? { expectedVersion: baseVersion } : {}),
        },
        initial && !asNew ? 'PUT' : 'POST',
      );
    } catch (e) {
      setError((e as Error).message);
      setConflict(e instanceof ApiError && e.status === 409);
      setBusy(false);
      return;
    }
    clean.current = true;
    setSaved(true);
    const cleanupError = clearDraft(storage, key);
    let presentationError = '';
    try {
      storage.setItem(
        `taskharbor:layout:${saved.id}`,
        JSON.stringify({ positions: state.positions, viewport: state.viewport }),
      );
    } catch {
      presentationError = 'Workflow saved, but the canvas layout could not be stored.';
      setStorageError(presentationError);
    }
    if (cleanupError) setStorageError(cleanupError);
    baseline.current = JSON.stringify(state);
    setStatus('Workflow saved');
    if (cleanupError || presentationError) {
      setBusy(false);
      return;
    }
    try {
      await created();
    } catch {
      setError('Workflow saved. Refresh the workspace to see it.');
    }
    setBusy(false);
  }
  async function reloadLatest() {
    if (!initial) return;
    setBusy(true);
    try {
      const current = await api<Workflow>('/workflows/' + initial.id);
      const next = initialize(current);
      setHistory(timeline(next));
      setBaseVersion(current.version);
      baseline.current = JSON.stringify(next);
      setSelected(next.definition.steps[0]?.id ?? null);
      setConflict(false);
      setError('');
      setStorageError(clearDraft(storage, key) ?? '');
      setStatus('Latest version loaded');
      flow.setViewport(next.viewport);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nodes: TaskNode[] = state.definition.steps.map((s) => ({
    id: s.id,
    type: 'task',
    measured: measurements[s.id],
    position: state.positions[s.id] ?? { x: 0, y: 0 },
    selected: s.id === selected,
    data: {
      label: s.name,
      kind: taskNames[s.type],
      dependencies: s.dependsOn.length,
      invalid: validation.errors.some((e) => e.step === s.id),
    },
  }));
  const edges = state.definition.steps.flatMap((s) =>
    s.dependsOn.map((d) => ({
      id: `${d}->${s.id}`,
      source: d,
      target: s.id,
      selected: selectedEdge === `${d}->${s.id}`,
      ariaLabel: `${d} to ${s.id}`,
    })),
  );
  return (
    <Dialog
      title={initial ? 'Workflow studio · Edit' : 'Workflow studio · Create'}
      close={() => {
        finish();
        close();
      }}
      className="studio-dialog"
      onEscape={() => {
        if (selected) setSelected(null);
        else {
          finish();
          close();
        }
      }}
      onKeyDown={(e) => {
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key.toLowerCase() === 'z' &&
          !(e.target instanceof HTMLElement && e.target.closest('input,textarea,select'))
        ) {
          e.preventDefault();
          finish();
          setHistory(e.shiftKey ? redo : undo);
        }
      }}
    >
      {saved ? (
        <div className="studio-recovery">
          <h3>Workflow saved</h3>
          <p role="status">Your workflow was saved successfully.</p>
          {storageError && <p role="alert">{storageError}</p>}
          <button className="primary" onClick={() => void created()}>
            Return to workspace
          </button>
        </div>
      ) : waiting ? (
        <div className="studio-recovery">
          <Layers3 size={32} />
          <h3>Continue your local draft?</h3>
          <p>
            {pending.error ??
              'A draft is stored in this browser. Choose whether to resume it or start from the saved definition.'}
          </p>
          {pending.draft && (
            <button
              className="primary"
              onClick={() => {
                const draft = pending.draft!;
                if (draft.sourceId !== (initial?.id ?? copy?.sourceId ?? null)) {
                  setPending({
                    draft: null,
                    error: 'This draft belongs to a different source. Discard it to continue.',
                  });
                  return;
                }
                setHistory(timeline(draft.state));
                setBaseVersion(draft.baseVersion);
                setSelected(draft.state.definition.steps[0]?.id ?? null);
                setPending({ draft: null });
                setConflict(!!initial && draft.baseVersion !== initial.version);
              }}
            >
              Continue draft
            </button>
          )}
          <button
            className="secondary"
            onClick={() => {
              setStorageError(clearDraft(storage, key) ?? '');
              setPending({ draft: null });
            }}
          >
            Discard draft
          </button>
        </div>
      ) : (
        <>
          <div className="studio-toolbar">
            <label className="field">
              Workflow name
              <input
                aria-label="Workflow name"
                maxLength={80}
                value={state.definition.name}
                onFocus={begin}
                onBlur={finish}
                onChange={(e) =>
                  transient((s) => ({
                    ...s,
                    definition: { ...s.definition, name: e.target.value },
                  }))
                }
              />
            </label>
            <span role="status" className="studio-save-state">
              {status}
              {copy ? ` · Copy of v${copy.version}` : initial ? ` · Based on v${baseVersion}` : ''}
            </span>
            <button
              className="secondary small"
              aria-label="Undo edit"
              disabled={!history.past.length}
              onClick={() => {
                finish();
                setHistory(undo);
              }}
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              className="secondary small"
              aria-label="Redo edit"
              disabled={!history.future.length}
              onClick={() => {
                finish();
                setHistory(redo);
              }}
            >
              <Redo2 size={15} /> Redo
            </button>
            <button
              className="secondary small"
              onClick={() => {
                change((s) => ({ ...s, positions: arrange(s.definition.steps) }));
                requestAnimationFrame(() => void flow.fitView({ padding: 0.2 }));
              }}
            >
              <LayoutGrid size={15} /> Auto layout
            </button>
            <button
              className="primary small"
              disabled={busy || conflict}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : initial ? 'Save version' : 'Create workflow'}
            </button>
          </div>
          {(error || storageError) && (
            <p className="alert" role="alert">
              {error || storageError}
            </p>
          )}
          {conflict && (
            <div className="studio-conflict" role="alert">
              <strong>The source has a newer version. Your draft is preserved.</strong>
              <button className="secondary small" disabled={busy} onClick={() => void save(true)}>
                Save draft as new workflow
              </button>
              <button
                className="secondary small"
                disabled={busy}
                onClick={() => void reloadLatest()}
              >
                Discard draft and reload latest
              </button>
            </div>
          )}
          <div className="studio-mobile-tabs">
            <button className="secondary" onClick={() => setMobilePanel('palette')}>
              Tasks & steps
            </button>
            <button className="secondary" onClick={() => setMobilePanel('settings')}>
              Step settings
            </button>
          </div>
          <div className="studio-workspace">
            <aside
              className={`studio-palette ${mobilePanel === 'palette' ? 'mobile-open' : ''}`}
              aria-label="Task palette"
            >
              <h3>Task palette</h3>
              <p className="muted">Drag onto the canvas or click to add.</p>
              {(Object.keys(taskNames) as Step['type'][]).map((type) => (
                <button
                  key={type}
                  className="studio-task"
                  disabled={state.definition.steps.length >= 20}
                  draggable={state.definition.steps.length < 20}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/taskharbor-task', type);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => add(type)}
                >
                  <Plus size={15} /> {taskNames[type]}
                </button>
              ))}
              <h3>Steps · {state.definition.steps.length}/20</h3>
              <div className="studio-step-list">
                {state.definition.steps.map((s) => (
                  <button
                    key={s.id}
                    className={s.id === selected ? 'active' : ''}
                    onClick={() => {
                      finish();
                      setSelected(s.id);
                      setMobilePanel('settings');
                    }}
                  >
                    {s.name || s.id}
                    <small>{s.id}</small>
                  </button>
                ))}
              </div>
              <label className="field">
                Description
                <textarea
                  maxLength={400}
                  value={state.definition.description}
                  onFocus={begin}
                  onBlur={finish}
                  onChange={(e) =>
                    transient((s) => ({
                      ...s,
                      definition: { ...s.definition, description: e.target.value },
                    }))
                  }
                />
              </label>
            </aside>
            <div
              className="studio-canvas"
              aria-label="Workflow canvas"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const type = e.dataTransfer.getData('application/taskharbor-task');
                if (Object.hasOwn(taskNames, type))
                  add(
                    type as Step['type'],
                    flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                  );
              }}
            >
              <ReactFlow<TaskNode>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                defaultViewport={state.viewport}
                minZoom={0.1}
                maxZoom={4}
                onNodeClick={(_, node) => {
                  finish();
                  setSelected(node.id);
                  setMobilePanel('settings');
                }}
                onNodeDragStart={begin}
                onNodeDrag={(_, node) =>
                  transient((s) => ({
                    ...s,
                    positions: { ...s.positions, [node.id]: node.position },
                  }))
                }
                onNodeDragStop={finish}
                onNodesChange={(changes) => {
                  for (const item of changes)
                    if (item.type === 'dimensions' && item.dimensions)
                      setMeasurements((previous) =>
                        previous[item.id]?.width === item.dimensions!.width &&
                        previous[item.id]?.height === item.dimensions!.height
                          ? previous
                          : { ...previous, [item.id]: item.dimensions! },
                      );
                    else if (item.type === 'position' && item.position && !item.dragging) {
                      const move = (s: StudioState) => ({
                        ...s,
                        positions: { ...s.positions, [item.id]: item.position! },
                      });
                      if (group.current) transient(move);
                      else change(move);
                    } else if (item.type === 'select' && item.selected) setSelected(item.id);
                }}
                onConnect={(connection) =>
                  change((s) => connect(s, connection.source, connection.target))
                }
                onEdgesChange={(changes) => {
                  for (const item of changes)
                    if (item.type === 'select') setSelectedEdge(item.selected ? item.id : null);
                }}
                onEdgesDelete={(items) =>
                  change((s) =>
                    items.reduce((result, edge) => disconnect(result, edge.source, edge.target), s),
                  )
                }
                onNodesDelete={(items) => {
                  change((s) => items.reduce((result, node) => removeStep(result, node.id), s));
                  setSelected(null);
                }}
                onMoveEnd={(_, viewport: Viewport) => transient((s) => ({ ...s, viewport }))}
                deleteKeyCode={['Backspace', 'Delete']}
              >
                <Background gap={24} />
                <Controls showInteractive={false} />
              </ReactFlow>
              {!state.definition.steps.length && (
                <div className="studio-empty">
                  <GitBranch size={34} />
                  <strong>Build your first flow</strong>
                  <p>Add a task, then connect its output to the next step.</p>
                </div>
              )}
            </div>
            <aside
              className={`studio-settings ${mobilePanel === 'settings' ? 'mobile-open' : ''}`}
              aria-label="Step settings"
            >
              {step ? (
                <>
                  <div className="studio-settings-title">
                    <h3>Step settings</h3>
                    <button
                      className="icon-button"
                      aria-label="Delete selected step"
                      onClick={() => {
                        change((s) => removeStep(s, step.id));
                        setSelected(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <code>{step.id}</code>
                  <label className="field">
                    Label
                    <input
                      aria-label="Step label"
                      maxLength={80}
                      value={step.name}
                      onFocus={begin}
                      onBlur={finish}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Task type
                    <select
                      value={step.type}
                      onChange={(e) =>
                        change((s) => ({
                          ...s,
                          raw: Object.fromEntries(
                            Object.entries(s.raw).filter(([id]) => id !== step.id),
                          ),
                          definition: {
                            ...s.definition,
                            steps: s.definition.steps.map((x) =>
                              x.id === step.id
                                ? {
                                    ...x,
                                    type: e.target.value as Step['type'],
                                    config:
                                      e.target.value === 'transform'
                                        ? { fields: {} }
                                        : { delayMs: 1000, failUntilAttempt: 0 },
                                  }
                                : x,
                            ),
                          },
                        }))
                      }
                    >
                      {(Object.keys(taskNames) as Step['type'][]).map((type) => (
                        <option value={type} key={type}>
                          {taskNames[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {step.type === 'transform' ? (
                    <label className="field">
                      Fields to merge (JSON object)
                      <textarea
                        aria-label="Fields to merge (JSON object)"
                        spellCheck={false}
                        value={
                          state.raw[step.id] ?? JSON.stringify(step.config.fields ?? {}, null, 2)
                        }
                        onFocus={begin}
                        onBlur={finish}
                        onChange={(e) =>
                          transient((s) => ({ ...s, raw: { ...s.raw, [step.id]: e.target.value } }))
                        }
                      />
                    </label>
                  ) : (
                    <label className="field">
                      Delay (milliseconds)
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        value={step.config.delayMs ?? 0}
                        onFocus={begin}
                        onBlur={finish}
                        onChange={(e) =>
                          patch({ config: { ...step.config, delayMs: Number(e.target.value) } })
                        }
                      />
                    </label>
                  )}
                  {step.type === 'checkpoint' && (
                    <label className="field">
                      Fail first N attempts
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={step.config.failUntilAttempt ?? 0}
                        onFocus={begin}
                        onBlur={finish}
                        onChange={(e) =>
                          patch({
                            config: { ...step.config, failUntilAttempt: Number(e.target.value) },
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="field">
                    Maximum attempts
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={step.maxAttempts ?? 3}
                      onFocus={begin}
                      onBlur={finish}
                      onChange={(e) => patch({ maxAttempts: Number(e.target.value) })}
                    />
                  </label>
                  <h3>Dependencies</h3>
                  <p className="muted">Later dependencies win when output keys overlap.</p>
                  {step.dependsOn.map((id, index) => (
                    <div className="studio-dependency" key={id}>
                      <span>{state.definition.steps.find((s) => s.id === id)?.name}</span>
                      <button
                        aria-label={`Move ${id} earlier`}
                        disabled={index === 0}
                        onClick={() => change((s) => reorder(s, step.id, index, -1))}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${id} later`}
                        disabled={index === step.dependsOn.length - 1}
                        onClick={() => change((s) => reorder(s, step.id, index, 1))}
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Disconnect ${id}`}
                        onClick={() => change((s) => disconnect(s, id, step.id))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="field">
                    Add dependency
                    <select
                      aria-label="Add dependency"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) change((s) => connect(s, e.target.value, step.id));
                      }}
                    >
                      <option value="">Choose a step…</option>
                      {state.definition.steps
                        .filter((s) => s.id !== step.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.id})
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              ) : (
                <div className="studio-empty-settings">
                  <h3>Select a step</h3>
                  <p className="muted">
                    Choose a task on the canvas or in the step list to configure it.
                  </p>
                </div>
              )}
              {!!validation.errors.length && (
                <div className="studio-validation" aria-label="Validation issues">
                  <h3>Needs attention</h3>
                  {validation.errors.map((issue, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        if (issue.step) setSelected(issue.step);
                      }}
                    >
                      {issue.step ? `${issue.step}: ` : ''}
                      {issue.message}
                    </button>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </Dialog>
  );
}
