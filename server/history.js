import { z } from 'zod';

export const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
  workflowId: z.string().min(1).max(80).optional(),
  cursor: z.string().max(2048).optional(),
  snapshot: z.coerce.number().int().nonnegative().safe().optional(),
});
const cursorSchema = z
  .object({
    time: z.number().int().nonnegative().safe(),
    id: z.string().min(1).max(80),
    snapshot: z.number().int().nonnegative().safe(),
    filter: z.string(),
  })
  .strict();

const fingerprint = ({ q, status, workflowId }) =>
  JSON.stringify([q, status ?? '', workflowId ?? '']);
export function decodeCursor(cursor, filters) {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    if (
      parsed.filter !== fingerprint(filters) ||
      (filters.snapshot !== undefined && filters.snapshot !== parsed.snapshot)
    )
      throw new Error();
    return parsed;
  } catch {
    const error = new Error(
      'Invalid cursor for the current filters. Refresh history and try again.',
    );
    error.statusCode = 400;
    throw error;
  }
}
export function encodeCursor(row, snapshot, filters) {
  return Buffer.from(
    JSON.stringify({ time: row.created_at, id: row.id, snapshot, filter: fingerprint(filters) }),
  ).toString('base64url');
}
