import { Layers3 } from 'lucide-react';
import type { RunSummary } from '../types';
export default function RunTable({
  runs,
  open,
  filtered = false,
}: {
  runs: RunSummary[];
  open: (id: string) => void;
  filtered?: boolean;
}) {
  return runs.length ? (
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
            <tr key={r.id} onClick={() => open(r.id)}>
              <td>
                <button
                  className="run-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(r.id);
                  }}
                >
                  {r.workflow_name}
                </button>
                <code>
                  {r.id.slice(0, 8)} · v{r.workflow_version}
                </code>
              </td>
              <td>
                <span className={'badge ' + r.status}>
                  <i />
                  {r.status}
                </span>
              </td>
              <td>
                <div className="progress">
                  <i
                    style={{
                      width: (r.step_count ? (r.completed_steps / r.step_count) * 100 : 0) + '%',
                    }}
                  />
                </div>
                <small>
                  {r.completed_steps} / {r.step_count} steps
                </small>
              </td>
              <td>
                {new Date(r.created_at).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                })}
              </td>
              <td>
                {r.finished_at !== null
                  ? ((r.finished_at - r.created_at) / 1000).toFixed(1) + 's'
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">
      <Layers3 size={30} />
      <h3>{filtered ? 'No matching runs' : 'Your first run starts here'}</h3>
      <p>
        {filtered
          ? 'Try another search or clear the filters.'
          : 'Launch a workflow to see its steps, retries and outputs.'}
      </p>
    </div>
  );
}
