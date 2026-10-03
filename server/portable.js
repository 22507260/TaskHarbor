import { z } from 'zod';
import { workflowSchema } from './definition.js';

const step = workflowSchema.shape.steps.element;
const portableWorkflow = workflowSchema
  .safeExtend({
    steps: z
      .array(
        step
          .extend({
            config: step.shape.config
              .unwrap()
              .strict()
              .default({ delayMs: 500, failUntilAttempt: 0, fields: {} }),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const portableSchema = z
  .object({
    format: z.literal('taskharbor.workflow'),
    formatVersion: z.literal(1),
    workflow: portableWorkflow,
  })
  .strict();

export function exportWorkflow(workflow) {
  return portableSchema.parse({
    format: 'taskharbor.workflow',
    formatVersion: 1,
    workflow: { name: workflow.name, description: workflow.description, steps: workflow.steps },
  });
}
