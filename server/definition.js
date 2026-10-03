import { z } from 'zod';

export const workflowSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(400).default(''),
    steps: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
          name: z.string().trim().min(1).max(80),
          type: z.enum(['transform', 'delay', 'checkpoint']),
          dependsOn: z.array(z.string()).max(20).default([]),
          config: z
            .object({
              delayMs: z.number().int().min(0).max(15000).default(500),
              failUntilAttempt: z.number().int().min(0).max(5).default(0),
              fields: z
                .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
                .default({}),
            })
            .default({ delayMs: 500, failUntilAttempt: 0, fields: {} }),
          maxAttempts: z.number().int().min(1).max(5).default(3),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((workflow, ctx) => {
    const ids = new Set(workflow.steps.map((s) => s.id));
    if (ids.size !== workflow.steps.length)
      ctx.addIssue({ code: 'custom', message: 'Step IDs must be unique' });
    const visited = new Set(),
      active = new Set();
    const visit = (id) => {
      if (active.has(id)) {
        ctx.addIssue({ code: 'custom', message: 'Workflow must be acyclic' });
        return;
      }
      if (visited.has(id)) return;
      active.add(id);
      const step = workflow.steps.find((s) => s.id === id);
      for (const dependency of step?.dependsOn ?? []) {
        if (!ids.has(dependency))
          ctx.addIssue({ code: 'custom', message: `Unknown dependency: ${dependency}` });
        else visit(dependency);
      }
      active.delete(id);
      visited.add(id);
    };
    workflow.steps.forEach((s) => visit(s.id));
  });

export const samples = [
  {
    name: 'Order enrichment',
    description: 'Validate an order, enrich its payload and prepare a fulfillment record.',
    steps: [
      {
        id: 'validate',
        name: 'Validate order',
        type: 'transform',
        config: { fields: { validated: true } },
      },
      {
        id: 'enrich',
        name: 'Enrich customer',
        type: 'delay',
        dependsOn: ['validate'],
        config: { delayMs: 2200 },
      },
      {
        id: 'fulfill',
        name: 'Prepare fulfillment',
        type: 'transform',
        dependsOn: ['enrich'],
        config: { fields: { fulfillment: 'ready', region: 'EU' } },
      },
    ],
  },
  {
    name: 'Resilient delivery',
    description: 'A controlled failure demonstrates persisted retries and exponential backoff.',
    steps: [
      {
        id: 'prepare',
        name: 'Prepare payload',
        type: 'transform',
        config: { fields: { channel: 'demo' } },
      },
      {
        id: 'deliver',
        name: 'Delivery checkpoint',
        type: 'checkpoint',
        dependsOn: ['prepare'],
        config: { failUntilAttempt: 2, delayMs: 700 },
        maxAttempts: 3,
      },
      {
        id: 'receipt',
        name: 'Create receipt',
        type: 'transform',
        dependsOn: ['deliver'],
        config: { fields: { delivered: true } },
      },
    ],
  },
  {
    name: 'Parallel quality gates',
    description: 'Two independent checks run before a shared release decision.',
    steps: [
      {
        id: 'source',
        name: 'Prepare release',
        type: 'transform',
        config: { fields: { release: '0.1.0' } },
      },
      {
        id: 'quality',
        name: 'Quality gate',
        type: 'delay',
        dependsOn: ['source'],
        config: { delayMs: 3000 },
      },
      {
        id: 'security',
        name: 'Security checkpoint',
        type: 'delay',
        dependsOn: ['source'],
        config: { delayMs: 1800 },
      },
      {
        id: 'release',
        name: 'Release decision',
        type: 'transform',
        dependsOn: ['quality', 'security'],
        config: { fields: { approved: true } },
      },
    ],
  },
].map((x) => workflowSchema.parse(x));
