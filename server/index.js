import { createApp } from './app.js';
import { Store } from './store.js';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const store = new Store();
store.seed();
const app = createApp(store),
  root = resolve('dist');
if (existsSync(root)) await app.register(staticPlugin, { root });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
await app.listen({ port: Number(process.env.PORT || 4310), host: '127.0.0.1' });
console.log('TaskHarbor API: http://127.0.0.1:' + (process.env.PORT || 4310));
