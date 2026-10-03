import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents, eventTone } from '../src/eventFilters.ts';
const events = [
  { id: 1, type: 'run.created', step_id: null, message: 'Run queued', created_at: 100 },
  {
    id: 2,
    type: 'job.retry',
    step_id: 'deliver',
    message: 'Transient failure; retry in 1000ms',
    created_at: 100,
  },
  {
    id: 3,
    type: 'job.recovered',
    step_id: 'check',
    message: 'Lease expired; returned to queue',
    created_at: 100,
  },
  {
    id: 4,
    type: 'job.failed',
    step_id: 'deliver',
    message: 'Attempt budget exhausted',
    created_at: 100,
  },
  { id: 5, type: 'run.failed', step_id: null, message: 'Run failed', created_at: 100 },
  { id: 6, type: 'job.succeeded', step_id: 'check', message: 'Step completed', created_at: 100 },
];
const options = { query: '', category: 'all', step: null, newest: false };
test('event categories distinguish failures, retries and worker recovery; selected steps combine with them', () => {
  assert.deepEqual(
    filterEvents(events, { ...options, category: 'errors' }).map((e) => e.id),
    [4, 5],
  );
  assert.deepEqual(
    filterEvents(events, { ...options, category: 'retries' }).map((e) => e.id),
    [2],
  );
  assert.deepEqual(
    filterEvents(events, { ...options, category: 'recovery' }).map((e) => e.id),
    [3],
  );
  assert.deepEqual(
    filterEvents(events, { ...options, category: 'errors', step: 'deliver' }).map((e) => e.id),
    [4],
  );
  assert.deepEqual(filterEvents(events, { ...options, category: 'recovery', step: 'deliver' }), []);
});
test('event search matches messages, types, step identity and workflow records with literal Unicode normalization', () => {
  assert.deepEqual(
    filterEvents(events, { ...options, query: '  DELIVER  ' }).map((e) => e.id),
    [2, 4],
  );
  assert.deepEqual(
    filterEvents(events, { ...options, query: 'job.retry' }).map((e) => e.id),
    [2],
  );
  assert.deepEqual(
    filterEvents(events, { ...options, query: 'workflow' }).map((e) => e.id),
    [1, 5],
  );
  assert.deepEqual(
    filterEvents(events, { ...options, query: 'exhausted', category: 'errors' }).map((e) => e.id),
    [4],
  );
  assert.deepEqual(filterEvents(events, { ...options, query: '.*' }), []);
  const unicode = [{ ...events[0], message: 'ＣＡＦÉ [100%]' }];
  assert.equal(filterEvents(unicode, { ...options, query: 'cafe\u0301' }).length, 1);
  assert.equal(filterEvents(unicode, { ...options, query: '[100%]' }).length, 1);
});
test('event ordering uses append IDs even with timestamp ties and never mutates the input', () => {
  const source = [...events].reverse(),
    original = JSON.stringify(source);
  assert.deepEqual(
    filterEvents(source, options).map((e) => e.id),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    filterEvents(source, { ...options, newest: true }).map((e) => e.id),
    [6, 5, 4, 3, 2, 1],
  );
  assert.equal(JSON.stringify(source), original);
  const appended = [...events, { ...events[3], id: 7 }];
  assert.deepEqual(
    filterEvents(appended, { ...options, category: 'errors', newest: true }).map((e) => e.id),
    [7, 5, 4],
  );
  assert.deepEqual(filterEvents([], options), []);
});
test('event tones keep cancellation, skips and unknown future types distinct from errors', () => {
  for (const type of ['job.failed', 'run.failed']) assert.equal(eventTone(type), 'error');
  for (const type of ['job.retry', 'job.recovered', 'job.skipped', 'run.cancelled'])
    assert.equal(eventTone(type), 'warning');
  for (const type of ['job.succeeded', 'run.succeeded']) assert.equal(eventTone(type), 'success');
  assert.equal(eventTone('job.started'), 'info');
  assert.equal(eventTone('future.event'), 'info');
});
