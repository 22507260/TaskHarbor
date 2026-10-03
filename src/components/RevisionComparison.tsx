import { useState } from 'react';
import { ArrowRight, ArrowRightLeft, GitCompareArrows } from 'lucide-react';
import { compareRevisions } from '../revisionDiff';
import type { FieldChange } from '../revisionDiff';
import type { Revision } from '../types';

const display = (value: unknown) =>
  value === undefined ? 'Not set' : JSON.stringify(value, null, 2);
function Changes({ changes }: { changes: FieldChange[] }) {
  return (
    <div className="diff-fields">
      {changes.map((change) => (
        <div className="diff-field" key={JSON.stringify(change.path)}>
          <code className="diff-path">
            {change.path.map((part) => JSON.stringify(part)).join(' → ')}
          </code>
          <div className="diff-values">
            <div className="diff-before">
              <span>Before</span>
              <pre>{display(change.before)}</pre>
            </div>
            <div className="diff-after">
              <span>After</span>
              <pre>{display(change.after)}</pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
export default function RevisionComparison({ revisions }: { revisions: Revision[] }) {
  const [from, setFrom] = useState(revisions[1].version),
    [to, setTo] = useState(revisions[0].version);
  const before = revisions.find((revision) => revision.version === from)!,
    after = revisions.find((revision) => revision.version === to)!;
  const diff = compareRevisions(before.definition, after.definition);
  const noChanges =
    !diff.added.length &&
    !diff.removed.length &&
    !diff.changed.length &&
    !diff.metadata.length &&
    !diff.orderChanged;
  return (
    <section className="revision-comparison" aria-label="Revision comparison">
      <div className="comparison-title">
        <GitCompareArrows size={17} />
        <h3>Compare definitions</h3>
      </div>
      <div className="comparison-controls">
        <label className="field">
          From version
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {revisions.map((revision) => (
              <option key={revision.version} value={revision.version}>
                v{revision.version}
              </option>
            ))}
          </select>
        </label>
        <ArrowRight size={17} aria-hidden="true" />
        <label className="field">
          To version
          <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {revisions.map((revision) => (
              <option key={revision.version} value={revision.version}>
                v{revision.version}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary small"
          aria-label="Swap comparison versions"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
        >
          <ArrowRightLeft size={15} /> Swap
        </button>
      </div>
      <p className="muted">
        Read-only comparison of v{from} → v{to}. Step IDs identify matching steps. Dependency order
        is preserved because it controls output merging.
      </p>
      <div className="diff-summary" role="status">
        <span className="added">+{diff.added.length} added</span>
        <span className="removed">−{diff.removed.length} removed</span>
        <span className="changed">{diff.changed.length} modified</span>
        <span>{diff.metadata.length} workflow fields</span>
      </div>
      {noChanges && <p className="diff-empty">These definitions are identical.</p>}
      {!!diff.metadata.length && (
        <details open>
          <summary>Workflow fields</summary>
          <Changes changes={diff.metadata} />
        </details>
      )}
      {diff.added.map((step) => (
        <details className="diff-step added" key={'add-' + step.id}>
          <summary>
            Added · {step.name} ({step.id})
          </summary>
          <pre>{JSON.stringify(step, null, 2)}</pre>
        </details>
      ))}
      {diff.removed.map((step) => (
        <details className="diff-step removed" key={'remove-' + step.id}>
          <summary>
            Removed · {step.name} ({step.id})
          </summary>
          <pre>{JSON.stringify(step, null, 2)}</pre>
        </details>
      ))}
      {diff.changed.map((step) => (
        <details className="diff-step changed" key={step.after.id} open>
          <summary>
            Modified · {step.after.name} ({step.after.id}) · {step.fields.length} fields
          </summary>
          <Changes changes={step.fields} />
        </details>
      ))}
      {diff.orderChanged && (
        <details>
          <summary>Step sequence changed</summary>
          <Changes
            changes={[{ path: ['steps', 'sequence'], before: diff.oldOrder, after: diff.newOrder }]}
          />
        </details>
      )}
    </section>
  );
}
