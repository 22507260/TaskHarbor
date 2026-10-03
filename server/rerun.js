import { z } from 'zod';
import { createHash } from 'node:crypto';

export const rerunSchema = z
  .object({
    requestId: z.string().uuid(),
    mode: z.enum(['source', 'latest']).default('source'),
    input: z.record(z.string(), z.unknown()).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'latest' && value.expectedVersion === undefined)
      ctx.addIssue({
        code: 'custom',
        message: 'expectedVersion is required for the latest workflow mode',
      });
  });
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export function requestHash(request) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(request)))
    .digest('hex');
}
