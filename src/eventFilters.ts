import type { Run } from './types';
export type Event = Run['events'][number];
export type EventCategory = 'all' | 'errors' | 'retries' | 'recovery';
export function eventTone(type: string) {
  if (['job.failed', 'run.failed'].includes(type)) return 'error';
  if (['job.retry', 'job.recovered', 'job.skipped', 'run.cancelled'].includes(type))
    return 'warning';
  if (['job.succeeded', 'run.succeeded'].includes(type)) return 'success';
  return 'info';
}
const fold = (text: string) => text.normalize('NFKC').toLowerCase();
export function filterEvents(
  events: Event[],
  options: { query: string; category: EventCategory; step: string | null; newest: boolean },
) {
  const query = fold(options.query.trim());
  const matching = events.filter((event) => {
    if (options.step && event.step_id !== options.step) return false;
    if (options.category === 'errors' && eventTone(event.type) !== 'error') return false;
    if (options.category === 'retries' && event.type !== 'job.retry') return false;
    if (options.category === 'recovery' && event.type !== 'job.recovered') return false;
    return (
      !query ||
      fold(`${event.message}\n${event.type}\n${event.step_id ?? 'workflow'}`).includes(query)
    );
  });
  return [...matching].sort((a, b) => (options.newest ? b.id - a.id : a.id - b.id));
}
