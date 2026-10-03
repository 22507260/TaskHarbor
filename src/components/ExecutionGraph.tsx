import { useMemo } from 'react';
import { Check, Circle, RefreshCw, X, LockKeyhole, Minus } from 'lucide-react';
import { layoutGraph } from '../graph';
import type { Run } from '../types';

export default function ExecutionGraph({
  run,
  selected,
  select,
}: {
  run: Run;
  selected: string | null;
  select: (id: string) => void;
}) {
  const graph = useMemo(() => layoutGraph(run.definition.steps), [run.definition.steps]);
  const jobs = new Map(run.jobs.map((job) => [job.step_id, job]));
  return (
    <section className="execution-map" aria-label="Live execution graph">
      <div className="execution-map-heading">
        <strong>Execution map</strong>
        <span>
          {run.definition.steps.length} steps · {graph.edges.length} connections
        </span>
      </div>
      <p>Select a step to inspect its result. Scroll across larger graphs.</p>
      <div className="execution-map-scroll" tabIndex={0} aria-label="Scrollable workflow graph">
        <div className="execution-map-canvas" style={{ width: graph.width, height: graph.height }}>
          <svg
            width={graph.width}
            height={graph.height}
            aria-hidden="true"
            className="execution-edges"
          >
            {graph.edges.map((edge, i) => (
              <path
                key={i}
                d={edge.path}
                className={
                  'edge ' +
                  (jobs.get(edge.from)?.status === 'succeeded' ? 'resolved' : '') +
                  (selected === edge.to || selected === edge.from ? ' highlighted' : '')
                }
              />
            ))}
          </svg>
          {graph.nodes.map((node) => {
            const step = run.definition.steps.find((s) => s.id === node.id)!,
              job = jobs.get(node.id),
              status = job?.status ?? 'blocked';
            const Icon =
              status === 'succeeded'
                ? Check
                : status === 'running'
                  ? RefreshCw
                  : status === 'failed'
                    ? X
                    : status === 'blocked'
                      ? LockKeyhole
                      : ['cancelled', 'skipped'].includes(status)
                        ? Minus
                        : Circle;
            return (
              <button
                key={node.id}
                className={'execution-node ' + status + (selected === node.id ? ' selected' : '')}
                style={{ left: node.x, top: node.y }}
                aria-pressed={selected === node.id}
                aria-label={`${step.name}: ${status}, attempt ${job?.attempt ?? 0} of ${step.maxAttempts}`}
                onClick={() => select(node.id)}
                title={step.name}
              >
                <span className="node-symbol">
                  <Icon size={16} className={status === 'running' ? 'spin' : ''} />
                </span>
                <span className="node-copy">
                  <strong>{step.name}</strong>
                  <small>
                    {status} · {job?.attempt ?? 0}/{step.maxAttempts}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="graph-legend">
        <span>
          <i className="succeeded" />
          Succeeded
        </span>
        <span>
          <i className="running" />
          Running
        </span>
        <span>
          <i className="failed" />
          Failed
        </span>
        <span>
          <i className="blocked" />
          Waiting / inactive
        </span>
      </div>
    </section>
  );
}
