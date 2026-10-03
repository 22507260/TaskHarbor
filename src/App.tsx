import { api } from './api';
import type { Workflow, Run, Worker, Step, RunSummary, HistoryPage, Overview } from './types';
import Dialog from './components/Dialog';
import RevisionHistory from './components/RevisionHistory';
import Builder from './components/WorkflowBuilder';
import RunHistory from './components/RunHistory';
import RunTable from './components/RunTable';
import RerunDialog from './components/RerunDialog';
import RunInspector from './components/RunInspector';
import WorkflowImport from './components/WorkflowImport';
import React, { useEffect, useState } from 'react';
import {
  Anchor,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Code2,
  GitBranch,
  Layers3,
  Play,
  Pencil,
  Plus,
  Search,
  Server,
  Settings2,
  Workflow as FlowIcon,
  X,
  Zap,
  Upload,
  Download,
} from 'lucide-react';

const date = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function Badge({ status }: { status: string }) {
  return (
    <span className={'badge ' + status}>
      <i />
      {status}
    </span>
  );
}
function App() {
  const [exportDocument, setExportDocument] = useState<{ text: string; filename: string } | null>(
    null,
  );
  const [importing, setImporting] = useState(false),
    [exporting, setExporting] = useState(false);
  async function download(workflow: Workflow) {
    setExporting(true);
    try {
      const document = await api<unknown>('/workflows/' + workflow.id + '/export');
      setExportDocument({
        text: JSON.stringify(document, null, 2) + '\n',
        filename:
          (workflow.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'workflow') + '.taskharbor.json',
      });
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const [workflows, setWorkflows] = useState<Workflow[]>([]),
    [runs, setRuns] = useState<RunSummary[]>([]),
    [workers, setWorkers] = useState<Worker[]>([]);
  const [overview, setOverview] = useState<Overview>({
    total: 0,
    active: 0,
    succeeded: 0,
    completed: 0,
    latestByWorkflow: [],
  });
  async function openRun(id: string) {
    try {
      setRun(await api<Run>('/runs/' + id + '?events=omit'));
      setTab('Runs');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const [tab, setTab] = useState('Workflows'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Workflow | null>(null),
    [run, setRun] = useState<Run | null>(null),
    [rerunSource, setRerunSource] = useState<Run | null>(null);
  const [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Workflow | null>(null),
    [launch, setLaunch] = useState<Workflow | null>(null),
    [input, setInput] = useState('{\n  "orderId": "ORD-1042",\n  "customer": "Ada"\n}'),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const [w, r, k, summary] = await Promise.all([
      api<Workflow[]>('/workflows'),
      api<HistoryPage>('/run-history?limit=5'),
      api<Worker[]>('/workers'),
      api<Overview>('/overview'),
    ]);
    setWorkflows(w);
    setRuns(r.items);
    setOverview(summary);
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
      api<Run>('/runs/' + id + '?events=omit')
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
  const { succeeded, completed } = overview;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Anchor size={23} />
          </span>
          TaskHarbor<span className="version">v0.1.9</span>
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
                aria-label={String(label)}
                aria-current={tab === label ? 'page' : undefined}
                className={tab === label ? 'nav-item chosen' : 'nav-item'}
                onClick={() => {
                  setTab(String(label));
                  setRun(null);
                  setSelected(null);
                }}
              >
                <I size={18} />
                {String(label)}
                {label === 'Runs' && <span>{overview.total}</span>}
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
              <div className="heading-actions">
                <button className="secondary" onClick={() => setImporting(true)}>
                  <Upload size={16} /> Import
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setError('');
                    setEditing(null);
                    setModal(true);
                  }}
                >
                  <Plus size={17} /> New workflow
                </button>
              </div>
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
          {tab === 'Workflows' && (
            <section className="operations-hero" aria-label="Workspace overview">
              <div className="hero-copy">
                <span className="hero-kicker">
                  <i className={connected ? 'online-dot' : 'offline-dot'} />{' '}
                  {connected ? 'CONNECTED TO YOUR ENGINE' : 'WAITING FOR YOUR ENGINE'}
                </span>
                <h2>
                  Build the flow.
                  <br />
                  <span>Keep work moving.</span>
                </h2>
                <p>
                  A clear path from your first step to the final result. Design, execute and trace
                  your workflows in one place.
                </p>
                <button className="hero-link" onClick={() => setTab('Runs')}>
                  Explore execution history <ArrowUpRight size={16} />
                </button>
              </div>
              <div
                className="engine-map"
                aria-label={`${workflows.length} workflows, ${overview.active} active runs, ${workers.filter((w) => w.online).length} online workers`}
              >
                <div className="map-label">
                  YOUR EXECUTION ENGINE <span>LIVE STATE</span>
                </div>
                <div className="map-track">
                  <div className="map-node">
                    <FlowIcon size={22} />
                    <strong>{workflows.length}</strong>
                    <small>Workflows</small>
                  </div>
                  <span className="map-wire" />
                  <div className="map-node core">
                    <Zap size={22} />
                    <strong>{overview.active}</strong>
                    <small>Active runs</small>
                  </div>
                  <span className="map-wire" />
                  <div className="map-node">
                    <Server size={22} />
                    <strong>{workers.filter((w) => w.online).length}</strong>
                    <small>Workers online</small>
                  </div>
                </div>
                <div className="map-caption">
                  <GitBranch size={14} /> Definitions → durable execution → worker fleet
                </div>
              </div>
            </section>
          )}
          <section className="metrics" aria-label="Execution statistics">
            <Metric
              label="Total runs"
              value={String(overview.total)}
              detail="All recorded executions"
              icon={<Layers3 size={18} />}
            />
            <Metric
              label="Active now"
              value={String(overview.active)}
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
                  .map((w) => {
                    const latest = overview.latestByWorkflow.find((r) => r.workflow_id === w.id);
                    return (
                      <article
                        className={
                          'workflow-card accent-' +
                          (Array.from(w.id).reduce((n, c) => n + c.charCodeAt(0), 0) % 3)
                        }
                        key={w.id}
                      >
                        <div className="card-top">
                          <span className="flow-icon">
                            <FlowIcon size={23} />
                          </span>
                          <span className="tag">
                            v{w.version} · {w.steps.length} steps
                          </span>
                        </div>
                        <button className="card-name" onClick={() => setSelected(w)}>
                          {w.name}
                          <ArrowUpRight size={16} />
                        </button>
                        <p>{w.description}</p>
                        <div className="graph-surface">
                          <span className="graph-label">DEPENDENCY MAP</span>
                          <MiniGraph steps={w.steps} />
                          <span className="graph-detail">
                            {w.steps.filter((s) => !s.dependsOn.length).length} entry steps ·{' '}
                            {w.steps.reduce((n, s) => n + s.dependsOn.length, 0)} connections
                          </span>
                        </div>
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
              {!workflows.some((w) => w.name.toLowerCase().includes(query.toLowerCase())) && (
                <div className="empty workflow-empty">
                  <Search size={28} />
                  <h3>No matching workflows</h3>
                  <p>Try another name or clear your search.</p>
                  <button className="secondary small" onClick={() => setQuery('')}>
                    Clear search
                  </button>
                </div>
              )}
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
              <section className="panel">
                <div className="panel-title">
                  <h2>Recent executions</h2>
                  <span className="muted">Latest 5 runs</span>
                </div>
                <RunTable runs={runs} open={openRun} />
              </section>
            </>
          )}
          {tab === 'Runs' && <RunHistory workflows={workflows} open={openRun} />}
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
          <p className="muted">
            Version {selected.version} · {selected.description}
          </p>
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
          <button
            className="secondary edit-action"
            onClick={async () => {
              try {
                const latest = await api<Workflow>('/workflows/' + selected.id);
                setEditing(latest);
                setSelected(null);
                setModal(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Pencil size={15} /> Edit latest version
          </button>
          <RevisionHistory workflowId={selected.id} />
          <button
            className="secondary"
            disabled={exporting}
            onClick={() => void download(selected)}
          >
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export latest JSON'}
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
          initial={editing}
          close={() => setModal(false)}
          created={async () => {
            setModal(false);
            await refresh();
          }}
        />
      )}
      {importing && (
        <WorkflowImport
          close={() => setImporting(false)}
          created={(workflow) => {
            setImporting(false);
            setSelected(workflow);
            void refresh().catch(() => setConnected(false));
          }}
        />
      )}
      {exportDocument && (
        <Dialog title="Export workflow" close={() => setExportDocument(null)}>
          <p className="muted">
            Latest definition only. Workflow identity, revisions, run inputs and execution history
            are excluded. Download the file or select the JSON below to copy it.
          </p>
          <label className="field">
            Workflow JSON
            <textarea
              readOnly
              className="code-input"
              rows={13}
              value={exportDocument.text}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setExportDocument(null)}>
              Close
            </button>
            <button
              className="primary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([exportDocument.text], { type: 'application/json' }),
                );
                const link = window.document.createElement('a');
                link.href = url;
                link.download = exportDocument.filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={15} /> Download JSON
            </button>
          </div>
        </Dialog>
      )}
      {run && (
        <RunInspector
          key={run.id}
          run={run}
          close={() => setRun(null)}
          openParent={openRun}
          rerun={() => {
            setRerunSource(run);
            setRun(null);
          }}
          cancel={async () => {
            try {
              setRun(await api<Run>('/runs/' + run.id + '/cancel', {}));
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
      {rerunSource && (
        <RerunDialog
          source={rerunSource}
          close={() => {
            setRun(rerunSource);
            setRerunSource(null);
          }}
          started={(created) => {
            setRerunSource(null);
            setRun(created);
            setTab('Runs');
            void refresh().catch(() => setConnected(false));
          }}
        />
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
export default App;
