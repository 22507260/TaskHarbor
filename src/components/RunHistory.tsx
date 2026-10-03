import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import type { Workflow, HistoryPage } from '../types';
import RunTable from './RunTable';

type Position = { cursor?: string; snapshot?: number };
const firstPage = { previous: [] as Position[] };
export default function RunHistory({
  workflows,
  open,
}: {
  workflows: Workflow[];
  open: (id: string) => void;
}) {
  const [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [workflowId, setWorkflowId] = useState(''),
    [limit, setLimit] = useState(10);
  const [position, setPosition] = useState<Position & { previous: Position[] }>(firstPage);
  const [page, setPage] = useState<HistoryPage | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setPosition(firstPage);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    setPage(null);
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: String(limit), q: search });
    if (status) params.set('status', status);
    if (workflowId) params.set('workflowId', workflowId);
    if (position.cursor) params.set('cursor', position.cursor);
    if (position.snapshot !== undefined) params.set('snapshot', String(position.snapshot));
    const fetchPage = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        const result = await api<HistoryPage>(
          '/run-history?' + params,
          undefined,
          'GET',
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setPage(result);
          setError('');
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        running = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchPage();
    const interval = setInterval(fetchPage, 1500);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [search, status, workflowId, limit, position, refresh]);
  const filtered = !!(search || status || workflowId);
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Execution history</h2>
        <button
          className="secondary small"
          onClick={() => {
            setPosition(firstPage);
            setRefresh((x) => x + 1);
          }}
        >
          <RefreshCw size={14} /> Refresh latest
        </button>
      </div>
      <div className="history-filters">
        <label className="history-search">
          <Search size={16} />
          <input
            aria-label="Search runs"
            placeholder="Workflow name or run ID…"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Run status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPosition(firstPage);
            }}
          >
            <option value="">All statuses</option>
            {['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Workflow
          <select
            aria-label="Run workflow"
            value={workflowId}
            onChange={(e) => {
              setWorkflowId(e.target.value);
              setPosition(firstPage);
            }}
          >
            <option value="">All workflows</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Page size
          <select
            aria-label="Runs per page"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPosition(firstPage);
            }}
          >
            {[5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered && (
        <div className="filter-summary">
          <span>Search uses the workflow name stored with each run.</span>
          <button
            onClick={() => {
              setQ('');
              setSearch('');
              setStatus('');
              setWorkflowId('');
              setPosition(firstPage);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          History could not be refreshed: {error}
        </div>
      )}
      {loading && !page ? (
        <div className="empty" role="status">
          Loading execution history…
        </div>
      ) : (
        page && (
          <RunTable
            runs={page.items}
            open={open}
            filtered={filtered || position.previous.length > 0}
          />
        )
      )}
      <div className="history-pagination">
        <span aria-live="polite">
          {page ? `${page.total} matching runs · page ${position.previous.length + 1}` : '—'}
          {position.snapshot !== undefined ? ' · anchored history' : ''}
        </span>
        <div>
          <button
            className="secondary small"
            disabled={loading || !position.previous.length}
            onClick={() => {
              const prev = position.previous.at(-1)!;
              setPosition({ ...prev, previous: position.previous.slice(0, -1) });
            }}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            className="secondary small"
            disabled={loading || !page?.nextCursor}
            onClick={() => {
              if (!page?.nextCursor) return;
              setPosition({
                cursor: page.nextCursor,
                snapshot: page.snapshot,
                previous: [
                  ...position.previous,
                  { cursor: position.cursor, snapshot: page.snapshot },
                ],
              });
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
