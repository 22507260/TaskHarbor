import React, { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  GitBranch,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Square,
  Workflow as FlowIcon,
  X,
  Zap,
} from 'lucide-react';

type Step = {
  id: string;
  name: string;
  type: 'transform' | 'delay' | 'checkpoint';
  dependsOn: string[];
  config: { delayMs?: number; failUntilAttempt?: number; fields?: Record<string, unknown> };
  maxAttempts?: number;
};
type Workflow = { id: string; name: string; description: string; steps: Step[] };
type Job = Step & {
  step_id: string;
  status: string;
  attempt: number;
  output: unknown;
  error: string | null;
  worker: string | null;
  available_at: number;
};
type Run = {
  id: string;
  workflow_id: string;
  status: string;
  created_at: number;
  finished_at: number | null;
  definition: Workflow;
  input: unknown;
  jobs: Job[];
  events: {
    id: number;
    type: string;
    message: string;
    step_id: string | null;
    created_at: number;
  }[];
};
type Worker = { id: string; online: boolean; seen_at: number };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    '/api' + path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.details?.join('; ') || result.error || 'Request failed');
  return result;
}
const short = (id: string) => id.slice(0, 8);
const date = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const active = (status: string) => ['queued', 'running'].includes(status);
function Badge({ status }: { status: string }) {
  return (
    <span className={'badge ' + status}>
      <i />
      {status}
    </span>
  );
}
function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]),
    [runs, setRuns] = useState<Run[]>([]),
    [workers, setWorkers] = useState<Worker[]>([]);
  const [tab, setTab] = useState('Workflows'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Workflow | null>(null),
    [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [modal, setModal] = useState(false),
    [launch, setLaunch] = useState<Workflow | null>(null),
    [input, setInput] = useState('{\n  "orderId": "ORD-1042",\n  "customer": "Ada"\n}'),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const [w, r, k] = await Promise.all([
      api<Workflow[]>('/workflows'),
      api<Run[]>('/runs'),
      api<Worker[]>('/workers'),
    ]);
    setWorkflows(w);
    setRuns(r);
    setWorkers(k);
    setConnected(true);
  }
  useEffect(() => {
    let live = true;
    const tick = () => {
      if (live)
        refresh().catch(() => {
          if (live) setConnected(false);
        });
    };
    tick();
    const interval = setInterval(tick, 1500);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (!run) return;
    let live = true;
    const id = run.id;
    const tick = () =>
      api<Run>('/runs/' + id)
        .then((x) => {
          if (live) setRun(x);
        })
        .catch(() => {});
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, [run?.id]);
  async function start() {
    if (!launch) return;
    setBusy(true);
    setError('');
    try {
      const created = await api<Run>('/workflows/' + launch.id + '/runs', {
        input: JSON.parse(input),
      });
      setRun(created);
      setLaunch(null);
      setSelected(null);
      setTab('Runs');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const succeeded = runs.filter((r) => r.status === 'succeeded').length,
    completed = runs.filter((r) => ['succeeded', 'failed'].includes(r.status)).length;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Anchor size={23} />
          </span>
          TaskHarbor<span className="version">v0.1</span>
        </a>
        <div className="workspace">
          <span className="avatar">P</span>
          <div>
            Personal workspace<small>Local development</small>
          </div>
          <Settings2 size={16} />
        </div>
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {[
            [FlowIcon, 'Workflows'],
            [Layers3, 'Runs'],
            [Server, 'Workers'],
          ].map(([Icon, label]) => {
            const I = Icon as typeof FlowIcon;
            return (
              <button
                key={String(label)}
                className={tab === label ? 'nav-item chosen' : 'nav-item'}
                onClick={() => {
                  setTab(String(label));
                  setRun(null);
                  setSelected(null);
                }}
              >
                <I size={18} />
                {String(label)}
                {label === 'Runs' && <span>{runs.length}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <GitBranch size={20} />
          <strong>Built to keep moving.</strong>
          <p>Durable jobs. Clear dependencies. Every attempt accounted for.</p>
          <a href="https://github.com/22507260" target="_blank" rel="noreferrer">
            Developer profile <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="connection">
          <i className={connected ? 'online-dot' : 'offline-dot'} />
          {connected ? 'API connected' : 'API unavailable'}
          <small>LOCAL</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} /> <strong>{tab}</strong>
          </span>
          <span className="environment">
            <Circle size={8} fill="currentColor" /> Development
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">WORKFLOW OPERATIONS</div>
              <h1>{tab}</h1>
              <p>
                {tab === 'Workflows'
                  ? 'Turn repeatable work into reliable execution.'
                  : tab === 'Runs'
                    ? 'Follow every step, attempt and outcome.'
                    : 'The processes keeping your work in motion.'}
              </p>
            </div>
            {tab === 'Workflows' && (
              <button
                className="primary"
                onClick={() => {
                  setError('');
                  setModal(true);
                }}
              >
                <Plus size={17} /> New workflow
              </button>
            )}
          </div>
          {!connected && (
            <div role="alert" className="alert">
              Cannot reach the API. Start the app with <code>npm run dev</code>. Reconnecting
              automatically.
            </div>
          )}
          {error && !launch && !modal && (
            <div role="alert" className="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          <section className="metrics">
            <Metric
              label="Total runs"
              value={String(runs.length)}
              detail="Latest 100 executions"
              icon={<Layers3 size={18} />}
            />
            <Metric
              label="Active now"
              value={String(runs.filter((r) => active(r.status)).length)}
              detail="Queued and running"
              icon={<Zap size={18} />}
            />
            <Metric
              label="Success rate"
              value={completed ? Math.round((succeeded / completed) * 100) + '%' : '—'}
              detail="Completed executions"
              icon={<Check size={18} />}
            />
            <Metric
              label="Workers online"
              value={String(workers.filter((w) => w.online).length)}
              detail="Heartbeat within 6 seconds"
              icon={<Server size={18} />}
            />
          </section>
          {tab === 'Workflows' && (
            <>
              <div className="section-toolbar">
                <div className="tabs">
                  <span className="current">
                    All workflows <b>{workflows.length}</b>
                  </span>
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search workflows"
                    placeholder="Search workflows…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="workflow-grid">
                {workflows
                  .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
                  .map((w, i) => {
                    const latest = runs.find((r) => r.workflow_id === w.id);
                    return (
                      <article className="workflow-card" key={w.id}>
                        <div className="card-top">
                          <span className={'flow-icon tone-' + (i % 3)}>
                            <FlowIcon size={23} />
                          </span>
                          <span className="tag">{w.steps.length} steps</span>
                        </div>
                        <button className="card-name" onClick={() => setSelected(w)}>
                          {w.name}
                          <ArrowUpRight size={16} />
                        </button>
                        <p>{w.description}</p>
                        <MiniGraph steps={w.steps} />
                        <div className="card-footer">
                          <span>{latest ? <Badge status={latest.status} /> : 'Ready to run'}</span>
                          <button
                            className="secondary small"
                            onClick={() => {
                              setLaunch(w);
                              setError('');
                            }}
                          >
                            <Play size={13} /> Run
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              <div className="info-strip">
                <span>
                  <GitBranch size={18} />
                  <strong>Execution you can inspect.</strong> Run snapshots, durable retries and a
                  complete event trail.
                </span>
                <button onClick={() => setTab('Runs')}>
                  View runs <ChevronRight size={15} />
                </button>
              </div>
              <RecentRuns
                runs={runs.slice(0, 5)}
                open={(r) => {
                  setRun(r);
                  setTab('Runs');
                }}
              />
            </>
          )}
          {tab === 'Runs' && <RecentRuns runs={runs} open={setRun} />}
          {tab === 'Workers' && (
            <div className="panel">
              <div className="panel-title">
                <h2>Worker fleet</h2>
                <span className="muted">Automatically discovered</span>
              </div>
              {workers.length ? (
                workers.map((w) => (
                  <div className="worker-row" key={w.id}>
                    <Server size={22} />
                    <div>
                      <strong>{w.id}</strong>
                      <small>Last heartbeat {date(w.seen_at)}</small>
                    </div>
                    <Badge status={w.online ? 'online' : 'offline'} />
                  </div>
                ))
              ) : (
                <div className="empty">
                  <Server size={30} />
                  <h3>No workers yet</h3>
                  <p>
                    Run <code>npm run worker</code> to start processing jobs.
                  </p>
                </div>
              )}
              <div className="panel-foot">
                Each worker claims one step at a time. Start another worker process to execute
                independent steps concurrently.
              </div>
            </div>
          )}
          <footer>
            TaskHarbor <span>•</span> Local-first workflow engine <span>•</span> Polling every 1.5s
          </footer>
        </div>
      </main>
      {selected && (
        <Dialog title={selected.name} close={() => setSelected(null)}>
          <p className="muted">{selected.description}</p>
          <div className="step-list">
            {selected.steps.map((s) => (
              <div className="definition-step" key={s.id}>
                <span className="step-symbol">
                  <Code2 size={18} />
                </span>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.type} ·{' '}
                    {s.dependsOn.length ? 'After ' + s.dependsOn.join(', ') : 'Entry step'} ·{' '}
                    {s.maxAttempts} attempts
                  </small>
                </div>
              </div>
            ))}
          </div>
          <button
            className="primary"
            onClick={() => {
              setLaunch(selected);
              setSelected(null);
            }}
          >
            <Play size={16} /> Run workflow
          </button>
        </Dialog>
      )}
      {launch && (
        <Dialog title={'Run ' + launch.name} close={() => setLaunch(null)}>
          <p className="muted">
            Provide a JSON object as the initial payload. Step outputs become the inputs of
            dependent steps.
          </p>
          <label className="field">
            Input payload
            <textarea
              className="code-input"
              rows={7}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy} onClick={start}>
            <Play size={16} />
            {busy ? 'Starting…' : 'Start run'}
          </button>
        </Dialog>
      )}
      {modal && (
        <Builder
          close={() => setModal(false)}
          created={async () => {
            setModal(false);
            await refresh();
          }}
        />
      )}
      {run && (
        <div className="drawer-backdrop" onClick={() => setRun(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-top">
              <div>
                <span className="eyebrow">RUN INSPECTOR</span>
                <h2>{run.definition.name}</h2>
                <code>{short(run.id)}</code>
              </div>
              <button
                className="icon-button"
                aria-label="Close run inspector"
                onClick={() => setRun(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="run-summary">
              <Badge status={run.status} />
              <span>{date(run.created_at)}</span>
              {active(run.status) && (
                <button
                  className="secondary small"
                  onClick={async () => {
                    try {
                      setRun(await api<Run>('/runs/' + run.id + '/cancel', {}));
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Square size={12} /> Cancel
                </button>
              )}
            </div>
            <h3 className="subheading">Execution steps</h3>
            <div className="step-list">
              {run.jobs.map((j) => (
                <div className={'execution-step ' + j.status} key={j.step_id}>
                  <span className="step-symbol">
                    {j.status === 'succeeded' ? (
                      <Check size={17} />
                    ) : j.status === 'running' ? (
                      <RefreshCw size={17} className="spin" />
                    ) : (
                      <Circle size={14} />
                    )}
                  </span>
                  <div>
                    <strong>{j.name}</strong>
                    <small>
                      {j.type} · attempt {j.attempt}/{j.maxAttempts}
                      {j.worker ? ' · ' + j.worker : ''}
                    </small>
                    {j.error && <p className="job-error">{j.error}</p>}
                  </div>
                  <Badge status={j.status} />
                </div>
              ))}
            </div>
            <h3 className="subheading">
              Event trail <span>{run.events.length}</span>
            </h3>
            <div className="event-trail">
              {run.events.map((e) => (
                <div className="event" key={e.id}>
                  <i />
                  <div>
                    <span>{e.message}</span>
                    <small>
                      {e.step_id || 'workflow'} · {e.type}
                    </small>
                  </div>
                  <time>{date(e.created_at)}</time>
                </div>
              ))}
            </div>
            <h3 className="subheading">Payloads</h3>
            <details>
              <summary>Run input</summary>
              <pre>{JSON.stringify(run.input, null, 2)}</pre>
            </details>
            {run.jobs
              .filter((j) => j.output !== null)
              .map((j) => (
                <details key={j.step_id}>
                  <summary>{j.name} output</summary>
                  <pre>{JSON.stringify(j.output, null, 2)}</pre>
                </details>
              ))}
          </aside>
        </div>
      )}
    </div>
  );
}
function MiniGraph({ steps }: { steps: Step[] }) {
  const levels = new Map<string, number>();
  const level = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    const deps = steps.find((s) => s.id === id)?.dependsOn ?? [];
    const result = deps.length ? Math.max(...deps.map(level)) + 1 : 0;
    levels.set(id, result);
    return result;
  };
  steps.forEach((s) => level(s.id));
  const columns = Math.max(...levels.values()) + 1;
  const positions = new Map(
    steps.map((s) => {
      const peers = steps.filter((p) => levels.get(p.id) === levels.get(s.id));
      return [
        s.id,
        {
          x: 18 + levels.get(s.id)! * 54,
          y: 30 + (peers.indexOf(s) - (peers.length - 1) / 2) * 34,
        },
      ];
    }),
  );
  const maxPeers = Math.max(
    ...steps.map((s) => steps.filter((p) => levels.get(p.id) === levels.get(s.id)).length),
  );
  const height = Math.max(60, maxPeers * 34 + 10),
    offset = (height - 60) / 2;
  return (
    <svg
      className="dag-preview"
      viewBox={`0 0 ${columns * 54} ${height}`}
      aria-label="Workflow dependency graph"
      role="img"
    >
      {steps.flatMap((s) =>
        s.dependsOn.map((d) => {
          const a = positions.get(d)!,
            b = positions.get(s.id)!;
          return (
            <path
              key={d + s.id}
              d={`M ${a.x + 13} ${a.y + offset} C ${a.x + 30} ${a.y + offset}, ${b.x - 30} ${b.y + offset}, ${b.x - 13} ${b.y + offset}`}
              fill="none"
              stroke="#515b71"
              strokeWidth="1.5"
            />
          );
        }),
      )}
      {steps.map((s) => {
        const p = positions.get(s.id)!;
        return (
          <g key={s.id} transform={`translate(${p.x},${p.y + offset})`}>
            <title>{s.name}</title>
            <rect x="-13" y="-13" width="26" height="26" rx="5" fill="#252d3d" stroke="#46516a" />
            <text textAnchor="middle" y="4" fill="#b4bed0" fontSize="10">
              {s.type === 'transform' ? '{}' : s.type === 'delay' ? '◷' : '↻'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function RecentRuns({ runs, open }: { runs: Run[]; open: (r: Run) => void }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Execution history</h2>
        <span className="muted">{runs.length} runs</span>
      </div>
      {runs.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workflow / run</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} onClick={() => open(r)}>
                  <td>
                    <button className="run-link" onClick={() => open(r)}>
                      {r.definition.name}
                    </button>
                    <code>{short(r.id)}</code>
                  </td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td>
                    <div className="progress">
                      <i
                        style={{
                          width:
                            (r.jobs.filter((j) => j.status === 'succeeded').length /
                              r.jobs.length) *
                              100 +
                            '%',
                        }}
                      />
                    </div>
                    <small>
                      {r.jobs.filter((j) => j.status === 'succeeded').length} / {r.jobs.length}{' '}
                      steps
                    </small>
                  </td>
                  <td>{date(r.created_at)}</td>
                  <td>
                    {r.finished_at ? ((r.finished_at - r.created_at) / 1000).toFixed(1) + 's' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <Layers3 size={30} />
          <h3>Your first run starts here</h3>
          <p>Launch a workflow to see its steps, retries and outputs.</p>
        </div>
      )}
    </section>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null),
    onClose = useRef(close);
  onClose.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLElement>('input,button,textarea,select')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose.current();
      if (e.key === 'Tab') {
        const elements = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,textarea,select,a[href]',
          ) ?? []),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-top">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Builder({ close, created }: { close: () => void; created: () => Promise<void> }) {
  const [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [steps, setSteps] = useState<Step[]>([
      {
        id: 'step_1',
        name: 'Prepare data',
        type: 'transform',
        dependsOn: [],
        config: { fields: { prepared: true } },
        maxAttempts: 3,
      },
    ]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const update = (index: number, patch: Partial<Step>) => {
    setError('');
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  async function save() {
    setBusy(true);
    setError('');
    try {
      const definition = steps.map((s) => {
        if (s.type !== 'transform') return s;
        const fields = JSON.parse(fieldDrafts[s.id] ?? JSON.stringify(s.config.fields ?? {}));
        if (!fields || Array.isArray(fields) || typeof fields !== 'object')
          throw new Error('Fields must be a JSON object.');
        return { ...s, config: { fields } };
      });
      await api('/workflows', { name, description, steps: definition });
      await created();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Create workflow" close={close}>
      <div className="builder-intro">Compose a dependency graph from safe, built-in tasks.</div>
      <label className="field">
        Name
        <input
          value={name}
          placeholder="e.g. Customer onboarding"
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
      </label>
      <label className="field">
        Description
        <input
          value={description}
          placeholder="What does this workflow accomplish?"
          maxLength={400}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="builder-steps">
        {steps.map((s, i) => (
          <div className="builder-step" key={s.id}>
            <div className="builder-step-heading">
              <strong>Step {i + 1}</strong>
              <code>{s.id}</code>
              {steps.length > 1 && (
                <button
                  className="icon-button"
                  aria-label={'Remove ' + s.id}
                  onClick={() =>
                    setSteps(
                      steps
                        .filter((x) => x.id !== s.id)
                        .map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== s.id) })),
                    )
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="form-row">
              <label className="field">
                Label
                <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
              </label>
              <label className="field">
                Task
                <select
                  value={s.type}
                  onChange={(e) =>
                    update(i, {
                      type: e.target.value as Step['type'],
                      config:
                        e.target.value === 'transform'
                          ? { fields: {} }
                          : { delayMs: 1000, failUntilAttempt: 0 },
                    })
                  }
                >
                  <option value="transform">JSON transform</option>
                  <option value="delay">Delay</option>
                  <option value="checkpoint">Retry checkpoint</option>
                </select>
              </label>
            </div>
            {s.type === 'transform' ? (
              <label className="field">
                Fields to merge (JSON object)
                <input
                  value={fieldDrafts[s.id] ?? JSON.stringify(s.config.fields ?? {})}
                  onChange={(e) => {
                    setFieldDrafts({ ...fieldDrafts, [s.id]: e.target.value });
                    setError('');
                  }}
                />
              </label>
            ) : (
              <div className="form-row">
                <label className="field">
                  Delay (milliseconds)
                  <input
                    type="number"
                    min="0"
                    max="15000"
                    value={s.config.delayMs}
                    onChange={(e) =>
                      update(i, { config: { ...s.config, delayMs: Number(e.target.value) } })
                    }
                  />
                </label>
                {s.type === 'checkpoint' && (
                  <label className="field">
                    Fail first N attempts
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={s.config.failUntilAttempt}
                      onChange={(e) =>
                        update(i, {
                          config: { ...s.config, failUntilAttempt: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                )}
              </div>
            )}
            <label className="field">
              Maximum attempts
              <input
                type="number"
                min="1"
                max="5"
                value={s.maxAttempts}
                onChange={(e) => update(i, { maxAttempts: Number(e.target.value) })}
              />
            </label>
            {i > 0 && (
              <fieldset>
                <legend>Depends on</legend>
                {steps.slice(0, i).map((parent) => (
                  <label className="checkbox" key={parent.id}>
                    <input
                      type="checkbox"
                      checked={s.dependsOn.includes(parent.id)}
                      onChange={(e) =>
                        update(i, {
                          dependsOn: e.target.checked
                            ? [...s.dependsOn, parent.id]
                            : s.dependsOn.filter((x) => x !== parent.id),
                        })
                      }
                    />
                    {parent.name}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        ))}
      </div>
      <button
        className="secondary"
        disabled={steps.length >= 20}
        onClick={() => {
          const id = 'step_' + (Math.max(0, ...steps.map((s) => Number(s.id.split('_')[1]))) + 1);
          setSteps([
            ...steps,
            {
              id,
              name: 'New step',
              type: 'delay',
              dependsOn: [steps[steps.length - 1].id],
              config: { delayMs: 1000 },
              maxAttempts: 3,
            },
          ]);
        }}
      >
        <Plus size={15} /> Add step
      </button>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-actions">
        <button className="secondary" onClick={close}>
          Cancel
        </button>
        <button className="primary" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Create workflow'}
        </button>
      </div>
    </Dialog>
  );
}
export default App;
