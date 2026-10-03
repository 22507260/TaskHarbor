import { Check, Circle, RefreshCw, Square, X } from 'lucide-react';
import type { Run } from '../types';
import { useEffect, useRef, useState } from 'react';
import ExecutionGraph from './ExecutionGraph';
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
  const [selected, setSelected] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),[tabindex="0"],summary,textarea,input:not(:disabled)',
        ) ?? []),
      ].filter((element) => element.getClientRects().length);
      const first = elements[0],
        last = elements.at(-1);
      if (!panel.current?.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  const selectedJob = run.jobs.find((job) => job.step_id === selected);
  const visibleEvents = selected
    ? run.events.filter((event) => event.step_id === selected)
    : run.events;
  return (
    <div className="drawer-backdrop" onClick={() => close()}>
      <aside
        ref={panel}
        className="drawer execution-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={'Inspect run: ' + run.definition.name}
        onClick={(e) => e.stopPropagation()}
      >
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
        <ExecutionGraph run={run} selected={selected} select={setSelected} />
        {selectedJob && (
          <section className="selected-step" aria-label="Selected step details">
            <div className="selected-step-heading">
              <h3>{selectedJob.name}</h3>
              <button
                className="secondary small"
                onClick={() => {
                  panel.current
                    ?.querySelector<HTMLButtonElement>('.execution-node[aria-pressed="true"]')
                    ?.focus();
                  setSelected(null);
                }}
              >
                Clear selection
              </button>
            </div>
            <div className="selected-step-meta">
              <Badge status={selectedJob.status} />
              <code>{selectedJob.step_id}</code>
              <span>
                Attempt {selectedJob.attempt}/{selectedJob.maxAttempts}
              </span>
            </div>
            <p className="muted">
              {selectedJob.dependsOn.length
                ? 'Depends on: ' + selectedJob.dependsOn.join(', ')
                : 'Entry step · receives the run input'}
              {selectedJob.worker ? ' · ' + selectedJob.worker : ''}
            </p>
            {selectedJob.status === 'queued' && selectedJob.attempt > 0 && (
              <p className="muted">
                Retry eligible at {date(selectedJob.available_at)}; execution depends on worker
                availability.
              </p>
            )}
            {selectedJob.error && <p className="job-error">{selectedJob.error}</p>}
            {selectedJob.output !== null ? (
              <details open>
                <summary>Selected step output</summary>
                <pre>{JSON.stringify(selectedJob.output, null, 2)}</pre>
              </details>
            ) : (
              <p className="muted">No output recorded yet.</p>
            )}
          </section>
        )}
        <h3 className="subheading">Execution steps</h3>
        <div className="step-list">
          {run.jobs.map((j) => (
            <div
              className={'execution-step ' + j.status + (selected === j.step_id ? ' selected' : '')}
              key={j.step_id}
            >
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
                <button
                  className="step-select"
                  onClick={() => setSelected(j.step_id)}
                  aria-pressed={selected === j.step_id}
                >
                  {j.name}
                </button>
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
          Event trail{' '}
          <span>
            {visibleEvents.length}
            {selected ? ' · selected step' : ''}
          </span>
        </h3>
        <div className="event-trail">
          {!visibleEvents.length && <p className="muted">No events recorded for this step yet.</p>}
          {visibleEvents.map((e) => (
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
