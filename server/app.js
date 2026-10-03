import Fastify from 'fastify';
import { ZodError, z } from 'zod';
import { Store } from './store.js';
import { exportWorkflow, portableSchema } from './portable.js';

export function createApp(store = new Store()) {
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  app.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;
    const allowed = new Set([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      `http://127.0.0.1:${process.env.PORT || 4310}`,
      `http://localhost:${process.env.PORT || 4310}`,
    ]);
    if (origin && !allowed.has(origin))
      return reply.code(403).send({ error: 'Origin not allowed' });
    done();
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: 'Invalid request', details: error.issues.map((x) => x.message) });
    if (error.statusCode && error.statusCode < 500)
      return reply.code(error.statusCode).send({ error: error.message });
    request.log.error(error);
    reply.code(500).send({ error: 'Internal server error' });
  });
  app.get('/api/health', () => ({ status: 'ok', version: '0.1.9' }));
  app.get('/api/workflows', () => store.workflows());
  app.post('/api/workflows', (request, reply) =>
    reply.code(201).send(store.createWorkflow(request.body)),
  );
  app.get('/api/workflows/:id/export', (request, reply) => {
    const workflow = store.workflow(request.params.id);
    return workflow
      ? exportWorkflow(workflow)
      : reply.code(404).send({ error: 'Workflow not found' });
  });
  app.post('/api/workflow-imports/preview', (request) => portableSchema.parse(request.body));
  app.post('/api/workflow-imports', (request, reply) => {
    const document = portableSchema.parse(request.body);
    return reply.code(201).send(store.createWorkflow(document.workflow));
  });
  app.get(
    '/api/workflows/:id',
    (request, reply) =>
      store.workflow(request.params.id) ?? reply.code(404).send({ error: 'Workflow not found' }),
  );
  app.get(
    '/api/workflows/:id/revisions',
    (request, reply) =>
      store.revisions(request.params.id) ?? reply.code(404).send({ error: 'Workflow not found' }),
  );
  app.put('/api/workflows/:id', (request, reply) => {
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().positive() })
      .parse(request.body);
    return (
      store.updateWorkflow(request.params.id, expectedVersion, request.body) ??
      reply.code(404).send({ error: 'Workflow not found' })
    );
  });
  app.get('/api/runs', () => store.runs());
  app.get('/api/run-history', (request) => store.runHistory(request.query));
  app.get('/api/overview', () => store.overview());
  app.get('/api/runs/:id', (request, reply) => {
    const { events } = z
      .object({ events: z.enum(['include', 'omit']).default('include') })
      .parse(request.query);
    return (
      store.run(request.params.id, events !== 'omit') ??
      reply.code(404).send({ error: 'Run not found' })
    );
  });
  app.get(
    '/api/runs/:id/events',
    (request, reply) =>
      store.eventHistory(request.params.id, request.query) ??
      reply.code(404).send({ error: 'Run not found' }),
  );
  app.post('/api/workflows/:id/runs', (request, reply) => {
    const { input } = z
      .object({ input: z.record(z.string(), z.unknown()).default({}) })
      .parse(request.body ?? {});
    const run = store.start(request.params.id, input);
    return run ? reply.code(201).send(run) : reply.code(404).send({ error: 'Workflow not found' });
  });
  app.post(
    '/api/runs/:id/cancel',
    (request, reply) =>
      store.cancel(request.params.id) ?? reply.code(404).send({ error: 'Run not found' }),
  );
  app.post('/api/runs/:id/rerun', (request, reply) => {
    const result = store.rerun(request.params.id, request.body);
    if (!result) return reply.code(404).send({ error: 'Run not found' });
    return reply.code(result.reused ? 200 : 201).send(result.run);
  });
  app.get('/api/workers', () => store.workers());
  app.addHook('onClose', () => store.close());
  return app;
}
