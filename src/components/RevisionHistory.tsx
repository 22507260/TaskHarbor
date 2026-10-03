import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../api';
import type { Revision } from '../types';
import RevisionComparison from './RevisionComparison';
export default function RevisionHistory({ workflowId }: { workflowId: string }) {
  const [revisions, setRevisions] = useState<Revision[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setRevisions([]);
    setError('');
    api<Revision[]>('/workflows/' + workflowId + '/revisions', undefined, 'GET', controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setRevisions(rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
    };
  }, [workflowId]);
  return (
    <section className="revision-history">
      <h3 className="subheading">
        <History size={15} /> Version history
      </h3>
      {error && (
        <p role="alert" className="muted">
          {error}
        </p>
      )}
      {revisions.length > 1 && <RevisionComparison key={workflowId} revisions={revisions} />}
      {revisions.length === 1 && (
        <p className="muted">One version recorded. Save a workflow change to compare revisions.</p>
      )}
      {revisions.map((revision) => (
        <details key={revision.version}>
          <summary>
            Version {revision.version} · {revision.definition.name} ·{' '}
            {new Date(revision.created_at).toLocaleString()}
          </summary>
          <p className="revision-description">{revision.definition.description}</p>
          <pre>{JSON.stringify(revision.definition, null, 2)}</pre>
        </details>
      ))}
    </section>
  );
}
