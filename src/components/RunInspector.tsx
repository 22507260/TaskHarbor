import { Check, Circle, RefreshCw, Square, X } from 'lucide-react';
import type { Run } from '../types';
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
export default function RunInspector({
  run,
  close,
  cancel,
  rerun,
  openParent,
}: {
  run: Run;
  close: () => void;
  cancel: () => Promise<void>;
  rerun: () => void;
  openParent: (id: string) => void;
}) {
  return (
    <div className="drawer-backdrop" onClick={() => close()}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-top">
          <div>
            <span className="eyebrow">RUN INSPECTOR</span>
            <h2>{run.definition.name}</h2>
            <code>
              {short(run.id)} · workflow v{run.workflow_version}
            </code>
          </div>
          <button className="icon-button" aria-label="Close run inspector" onClick={() => close()}>
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
                void cancel();
              }}
            >
              <Square size={12} /> Cancel
            </button>
          )}
        </div>
        <div className="rerun-toolbar">
          <button className="secondary small" disabled={active(run.status)} onClick={rerun}>
            <RefreshCw size={14} /> Rerun with edited input
          </button>
          {active(run.status) && (
            <span className="muted">Available after completion or cancellation.</span>
          )}
          {run.parent_run_id && (
            <button className="source-link" onClick={() => openParent(run.parent_run_id!)}>
              Source run: {short(run.parent_run_id)}
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
  );
}
