import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { samples } from '../server/definition.js';

test(
  'real worker processes execute parallel branches and persist completion',
  { timeout: 15000 },
  async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'taskharbor-worker-')),
      path = join(directory, 'queue.db');
    const store = new Store(path);
    const children = [];
    t.after(async () => {
      for (const child of children) {
        child.kill();
        if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
      }
      store.close();
      rmSync(directory, { recursive: true });
    });
    const workflow = store.createWorkflow(samples[2]),
      run = store.start(workflow.id, { build: 'test' });
    for (const id of ['test-worker-a', 'test-worker-b']) {
      const child = spawn(process.execPath, ['server/worker.js'], {
        env: { ...process.env, TASKHARBOR_DB: path, WORKER_ID: id },
        stdio: 'ignore',
      });
      children.push(child);
    }
    let sawParallel = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const current = store.run(run.id);
      if (current.jobs.filter((j) => j.status === 'running').length === 2) sawParallel = true;
      if (current.status === 'succeeded') break;
      await sleep(50);
    }
    const result = store.run(run.id);
    assert.equal(result.status, 'succeeded');
    assert.equal(sawParallel, true);
    assert.equal(result.jobs.at(-1).output.approved, true);
    assert.equal(result.jobs.at(-1).output.build, 'test');
    assert.equal(new Set(result.jobs.map((j) => j.worker)).size, 2);
  },
);
