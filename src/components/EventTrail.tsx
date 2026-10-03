import { useEffect, useState } from 'react';
import { Search, ListFilter } from 'lucide-react';
import type { Run } from '../types';
import { eventTone } from '../eventFilters';
import { api } from '../api';
import type { EventCategory } from '../eventFilters';
const time = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function EventTrail({
  runId,
  step,
  clearStep,
}: {
  runId: string;
  step: string | null;
  clearStep: () => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState<EventCategory>('all'),
    [newest, setNewest] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [pageNumber, setPageNumber] = useState(1),
    [refresh, setRefresh] = useState(0);
  type Page = {
    items: Run['events'];
    total: number;
    recorded: number;
    snapshot: number;
    nextCursor: string | null;
  };
  const [page, setPage] = useState<Page | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  function reset() {
    setCursor(null);
    setPageNumber(1);
    setRefresh((value) => value + 1);
  }
  useEffect(() => {
    reset();
  }, [step]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setPage(null);
    setLoading(true);
    setError('');
    async function fetchPage() {
      try {
        const params = new URLSearchParams({
          limit: '50',
          q: query,
          category,
          order: newest ? 'newest' : 'oldest',
        });
        if (step) params.set('step', step);
        if (cursor) params.set('cursor', cursor);
        const result = await api<Page>(
          '/runs/' + runId + '/events?' + params,
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
        if (!controller.signal.aborted) {
          setLoading(false);
          if (!cursor) timer = setTimeout(fetchPage, 1500);
        }
      }
    }
    const debounce = setTimeout(() => void fetchPage(), 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(debounce);
    };
  }, [runId, query, category, newest, step, cursor, refresh]);
  const filtered = !!query.trim() || category !== 'all' || !!step;
  return (
    <section className="event-console" aria-label="Execution event trail">
      <h3 className="subheading">
        <ListFilter size={15} /> Event trail <span>{page?.recorded ?? '…'} recorded</span>
      </h3>
      <div className="event-controls">
        <label className="event-search">
          <Search size={15} />
          <input
            aria-label="Search execution events"
            placeholder="Search messages, types, step IDs…"
            maxLength={100}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
          />
        </label>
        <label className="field">
          Event group
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as EventCategory);
              reset();
            }}
          >
            <option value="all">All events</option>
            <option value="errors">Errors</option>
            <option value="retries">Retries</option>
            <option value="recovery">Worker recovery</option>
          </select>
        </label>
        <label className="field">
          Event order
          <select
            value={newest ? 'newest' : 'oldest'}
            onChange={(e) => {
              setNewest(e.target.value === 'newest');
              reset();
            }}
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </div>
      <div className="event-results">
        <span role="status">
          {page?.total ?? '…'} matching / {page?.recorded ?? '…'} recorded
          {step ? ` · step: ${step}` : ''}
        </span>
        {filtered && (
          <button
            className="event-clear"
            onClick={() => {
              setQuery('');
              setCategory('all');
              clearStep();
              reset();
            }}
          >
            Clear event filters
          </button>
        )}
      </div>
      <div className="event-trail">
        {!loading && page && !page.items.length && (
          <div className="event-empty">
            <Search size={20} />
            <strong>{page.recorded ? 'No matching events' : 'No events recorded yet'}</strong>
            <p>
              {filtered
                ? 'Adjust the search, event group or selected step.'
                : 'Events appear as the execution progresses.'}
            </p>
          </div>
        )}
        {page?.items.map((event) => (
          <div className={'event tone-' + eventTone(event.type)} key={event.id}>
            <i aria-hidden="true" />
            <div>
              <span>{event.message}</span>
              <small>
                <b>{eventTone(event.type)}</b> · {event.step_id || 'workflow'} · {event.type} · #
                {event.id}
              </small>
            </div>
            <time
              dateTime={new Date(event.created_at).toISOString()}
              title={new Date(event.created_at).toLocaleString()}
            >
              {time(event.created_at)}
            </time>
          </div>
        ))}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="muted" role="status">
          Loading events…
        </p>
      )}
      <div className="event-pagination">
        <span>
          Page {pageNumber} · {page?.items.length ?? 0} shown
          {cursor ? ' · anchored history' : ' · live first page'}
        </span>
        <div>
          <button className="secondary small" onClick={reset} disabled={loading}>
            Refresh latest
          </button>
          <button
            className="secondary small"
            disabled={loading || !page?.nextCursor}
            onClick={() => {
              setCursor(page!.nextCursor);
              setPageNumber((value) => value + 1);
            }}
          >
            Next 50 events
          </button>
        </div>
      </div>
    </section>
  );
}
