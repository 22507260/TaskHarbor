import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../api';
import type { Revision } from '../types';
export default function RevisionHistory({ workflowId }: { workflowId: string }) {
  const [revisions, setRevisions] = useState<Revision[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api<Revision[]>('/workflows/' + workflowId + '/revisions')
      .then((rows) => {
        if (live) setRevisions(rows);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
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
