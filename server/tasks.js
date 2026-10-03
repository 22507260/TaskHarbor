import { setTimeout as sleep } from 'node:timers/promises';
export async function execute(job, signal) {
  const parentOutputs = Object.values(job.dependencies);
  const input = parentOutputs.length ? Object.assign({}, ...parentOutputs) : job.input;
  if (job.type === 'transform') return { ...input, ...job.config.fields };
  await sleep(job.config.delayMs, undefined, { signal });
  if (job.type === 'checkpoint' && job.attempt <= job.config.failUntilAttempt)
    throw new Error('Simulated transient failure');
  return input;
}
