import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import staticPlugin from '@fastify/static';
// Each invocation uses a disposable database outside the user's workspace.
// Keep the temporary directory for diagnosing failures; OS temp cleanup may remove it.
const directory = mkdtempSync(join(tmpdir(), 'taskharbor-e2e-'));
process.env.PORT = '4321';
process.env.TASKHARBOR_DB = join(directory, 'queue.db');
const store = new Store();
store.seed();
const app = createApp(store);
await app.register(staticPlugin, { root: resolve('dist') });
const worker = spawn(process.execPath, ['server/worker.js'], {
  env: { ...process.env, WORKER_ID: 'e2e-worker' },
  stdio: 'inherit',
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  worker.kill();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await app.listen({ port: 4321, host: '127.0.0.1' });
