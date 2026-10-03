import { z } from 'zod';
export const eventQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  q: z.string().trim().max(100).default(''),
  category: z.enum(['all', 'errors', 'retries', 'recovery']).default('all'),
  step: z.string().min(1).max(40).optional(),
  order: z.enum(['oldest', 'newest']).default('oldest'),
  cursor: z.string().max(2048).optional(),
});
const fingerprint = (runId, query) =>
  JSON.stringify([runId, query.q, query.category, query.step ?? '', query.order]);
const cursorSchema = z
  .object({
    id: z.number().int().positive().safe(),
    snapshot: z.number().int().nonnegative().safe(),
    filter: z.string(),
  })
  .strict();
export function eventCursor(runId, query) {
  if (!query.cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
    );
    if (cursor.filter !== fingerprint(runId, query) || cursor.id > cursor.snapshot)
      throw new Error();
    return cursor;
  } catch {
    const error = new Error('Invalid event cursor. Refresh events and try again.');
    error.statusCode = 400;
    throw error;
  }
}
export function encodeEventCursor(runId, query, id, snapshot) {
  return Buffer.from(JSON.stringify({ id, snapshot, filter: fingerprint(runId, query) })).toString(
    'base64url',
  );
}
