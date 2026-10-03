import { Store } from './store.js';
import { execute } from './tasks.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const store = new Store(),
  worker = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
  });
console.log(`TaskHarbor ${worker} ready`);
while (!stopping) {
  const job = store.claim(worker);
  if (!job) {
    await sleep(300);
    continue;
  }
  const controller = new AbortController();
  const pulse = setInterval(() => {
    store.heartbeat(worker);
    if (!store.renew(job.id, job.token)) controller.abort();
  }, 1000);
  try {
    store.complete(job.id, job.token, await execute(job, controller.signal));
  } catch (error) {
    if (!controller.signal.aborted) store.complete(job.id, job.token, null, error.message);
  } finally {
    clearInterval(pulse);
  }
}
store.close();
