import { useEffect, useState } from 'react';
import { Search, ListFilter } from 'lucide-react';
import type { Run } from '../types';
import { eventTone, filterEvents } from '../eventFilters';
import type { EventCategory } from '../eventFilters';
const time = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function EventTrail({
  events,
  step,
  clearStep,
}: {
  events: Run['events'];
  step: string | null;
  clearStep: () => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState<EventCategory>('all'),
    [newest, setNewest] = useState(false),
    [limit, setLimit] = useState(50);
  useEffect(() => setLimit(50), [query, category, newest, step]);
  const matching = filterEvents(events, { query, category, newest, step });
  const filtered = !!query.trim() || category !== 'all' || !!step;
  return (
    <section className="event-console" aria-label="Execution event trail">
      <h3 className="subheading">
        <ListFilter size={15} /> Event trail <span>{events.length} recorded</span>
      </h3>
      <div className="event-controls">
        <label className="event-search">
          <Search size={15} />
          <input
            aria-label="Search execution events"
            placeholder="Search messages, types, step IDs…"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="field">
          Event group
          <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
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
            onChange={(e) => setNewest(e.target.value === 'newest')}
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </div>
      <div className="event-results">
        <span role="status">
          {matching.length} matching / {events.length} recorded{step ? ` · step: ${step}` : ''}
        </span>
        {filtered && (
          <button
            className="event-clear"
            onClick={() => {
              setQuery('');
              setCategory('all');
              clearStep();
            }}
          >
            Clear event filters
          </button>
        )}
      </div>
      <div className="event-trail">
        {!matching.length && (
          <div className="event-empty">
            <Search size={20} />
            <strong>{events.length ? 'No matching events' : 'No events recorded yet'}</strong>
            <p>
              {filtered
                ? 'Adjust the search, event group or selected step.'
                : 'Events appear as the execution progresses.'}
            </p>
          </div>
        )}
        {matching.slice(0, limit).map((event) => (
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
      {matching.length > limit && (
        <button className="secondary small event-more" onClick={() => setLimit(limit + 50)}>
          Show 50 more · {matching.length - limit} remaining
        </button>
      )}
    </section>
  );
}
