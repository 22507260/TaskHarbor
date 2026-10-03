import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { workflowSchema, samples } from './definition.js';

const terminal = new Set(['succeeded', 'failed', 'cancelled']);
export class Store {
  constructor(
    path = process.env.TASKHARBOR_DB || resolve('.data/taskharbor.db'),
    clock = Date.now,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.clock = clock;
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS workflows(id TEXT PRIMARY KEY, definition TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), definition TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), step_id TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, lease_until INTEGER, token TEXT, worker TEXT, output TEXT, error TEXT, UNIQUE(run_id,step_id));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), step_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS queue_lookup ON jobs(status, available_at);
      CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id);
      PRAGMA user_version=1;`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  event(run, step, type, message) {
    this.db
      .prepare('INSERT INTO events(run_id,step_id,type,message,created_at) VALUES(?,?,?,?,?)')
      .run(run, step, type, message, this.clock());
  }
  createWorkflow(body) {
    const definition = workflowSchema.parse(body),
      id = randomUUID();
    this.db
      .prepare('INSERT INTO workflows VALUES(?,?,?)')
      .run(id, JSON.stringify(definition), this.clock());
    return { id, ...definition };
  }
  workflows() {
    return this.db
      .prepare('SELECT * FROM workflows ORDER BY created_at,id')
      .all()
      .map((x) => ({ id: x.id, ...JSON.parse(x.definition) }));
  }
  seed() {
    if (!this.workflows().length)
      this.transaction(() => samples.forEach((x) => this.createWorkflow(x)));
  }
  start(workflowId, input = {}) {
    return this.transaction(() => {
      const workflow = this.db.prepare('SELECT * FROM workflows WHERE id=?').get(workflowId);
      if (!workflow) return null;
      const id = randomUUID(),
        now = this.clock(),
        definition = JSON.parse(workflow.definition);
      this.db
        .prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,NULL)')
        .run(id, workflowId, workflow.definition, JSON.stringify(input), 'queued', now);
      for (const step of definition.steps)
        this.db
          .prepare('INSERT INTO jobs(id,run_id,step_id,status,available_at) VALUES(?,?,?,?,?)')
          .run(randomUUID(), id, step.id, step.dependsOn.length ? 'blocked' : 'queued', now);
      this.event(id, null, 'run.created', 'Run queued');
      return this.run(id);
    });
  }
  runs() {
    return this.db
      .prepare('SELECT id FROM runs ORDER BY created_at DESC,rowid DESC LIMIT 100')
      .all()
      .map((x) => this.run(x.id, false));
  }
  run(id, detail = true) {
    const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if (!row) return null;
    const definition = JSON.parse(row.definition);
    const jobs = this.db
      .prepare('SELECT * FROM jobs WHERE run_id=? ORDER BY rowid')
      .all(id)
      .map((j) => ({
        ...j,
        output: j.output === null ? null : JSON.parse(j.output),
        ...definition.steps.find((s) => s.id === j.step_id),
        id: j.id,
      }));
    return {
      ...row,
      definition,
      input: JSON.parse(row.input),
      jobs,
      events: detail
        ? this.db.prepare('SELECT * FROM events WHERE run_id=? ORDER BY id').all(id)
        : [],
    };
  }
  heartbeat(worker) {
    this.db
      .prepare(
        'INSERT INTO workers VALUES(?,?) ON CONFLICT(id) DO UPDATE SET seen_at=excluded.seen_at',
      )
      .run(worker, this.clock());
  }
  workers() {
    return this.db
      .prepare('SELECT * FROM workers ORDER BY seen_at DESC')
      .all()
      .map((w) => ({ ...w, online: this.clock() - w.seen_at < 6000 }));
  }
  reconcile(runId) {
    const run = this.run(runId);
    if (!run || terminal.has(run.status)) return;
    for (const job of run.jobs.filter((j) => j.status === 'blocked')) {
      const deps = run.jobs.filter((j) => job.dependsOn.includes(j.step_id));
      if (deps.some((j) => ['failed', 'cancelled', 'skipped'].includes(j.status))) {
        this.db.prepare("UPDATE jobs SET status='skipped' WHERE id=?").run(job.id);
        this.event(runId, job.step_id, 'job.skipped', 'A dependency failed');
      } else if (deps.every((j) => j.status === 'succeeded'))
        this.db
          .prepare("UPDATE jobs SET status='queued',available_at=? WHERE id=?")
          .run(this.clock(), job.id);
    }
    const statuses = this.db
      .prepare('SELECT status FROM jobs WHERE run_id=?')
      .all(runId)
      .map((j) => j.status);
    if (statuses.every((s) => ['succeeded', 'failed', 'skipped'].includes(s))) {
      const state = statuses.every((s) => s === 'succeeded') ? 'succeeded' : 'failed';
      this.db
        .prepare('UPDATE runs SET status=?,finished_at=? WHERE id=?')
        .run(state, this.clock(), runId);
      this.event(runId, null, `run.${state}`, `Run ${state}`);
    }
  }
  claim(worker, leaseMs = 5000) {
    return this.transaction(() => {
      this.heartbeat(worker);
      const expired = this.db
        .prepare("SELECT * FROM jobs WHERE status='running' AND lease_until<=?")
        .all(this.clock());
      for (const job of expired) {
        const step = this.run(job.run_id).jobs.find((j) => j.id === job.id);
        const exhausted = job.attempt >= step.maxAttempts;
        this.db
          .prepare('UPDATE jobs SET status=?,token=NULL,lease_until=NULL,error=? WHERE id=?')
          .run(exhausted ? 'failed' : 'queued', 'Worker lease expired', job.id);
        this.event(
          job.run_id,
          job.step_id,
          'job.recovered',
          exhausted
            ? 'Lease expired; attempt budget exhausted'
            : 'Lease expired; returned to queue',
        );
      }
      const active = this.db
        .prepare("SELECT id FROM runs WHERE status IN ('queued','running')")
        .all();
      // Repeat to propagate dependency failures through a chain.
      for (const run of active) for (let i = 0; i < 20; i++) this.reconcile(run.id);
      const row = this.db
        .prepare(
          "SELECT j.* FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.status='queued' AND j.available_at<=? AND r.status IN ('queued','running') ORDER BY r.created_at,j.rowid LIMIT 1",
        )
        .get(this.clock());
      if (!row) return null;
      const token = randomUUID();
      this.db
        .prepare(
          "UPDATE jobs SET status='running',attempt=attempt+1,token=?,worker=?,lease_until=? WHERE id=?",
        )
        .run(token, worker, this.clock() + leaseMs, row.id);
      this.db.prepare("UPDATE runs SET status='running' WHERE id=?").run(row.run_id);
      this.event(row.run_id, row.step_id, 'job.started', `Attempt ${row.attempt + 1} started`);
      const run = this.run(row.run_id),
        job = run.jobs.find((j) => j.id === row.id);
      return {
        ...job,
        token,
        input: run.input,
        dependencies: Object.fromEntries(
          run.jobs
            .filter((j) => job.dependsOn.includes(j.step_id))
            .map((j) => [j.step_id, j.output]),
        ),
      };
    });
  }
  renew(id, token, leaseMs = 5000) {
    return (
      this.db
        .prepare(
          "UPDATE jobs SET lease_until=? WHERE id=? AND token=? AND status='running' AND lease_until>?",
        )
        .run(this.clock() + leaseMs, id, token, this.clock()).changes > 0
    );
  }
  complete(id, token, output, error = null) {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM jobs WHERE id=? AND token=? AND status='running' AND lease_until>?")
        .get(id, token, this.clock());
      if (!row) return false;
      const step = this.run(row.run_id).jobs.find((j) => j.id === id),
        retry = error && row.attempt < step.maxAttempts;
      const status = error ? (retry ? 'queued' : 'failed') : 'succeeded';
      const backoff = Math.min(30000, 1000 * 2 ** (row.attempt - 1));
      this.db
        .prepare(
          'UPDATE jobs SET status=?,output=?,error=?,available_at=?,token=NULL,lease_until=NULL WHERE id=?',
        )
        .run(
          status,
          error ? null : JSON.stringify(output),
          error,
          this.clock() + (retry ? backoff : 0),
          id,
        );
      this.event(
        row.run_id,
        row.step_id,
        retry ? 'job.retry' : `job.${status}`,
        error ? `${error}${retry ? `; retry in ${backoff}ms` : ''}` : 'Step completed',
      );
      for (let i = 0; i < 20; i++) this.reconcile(row.run_id);
      return true;
    });
  }
  cancel(id) {
    return this.transaction(() => {
      const run = this.run(id);
      if (!run) return null;
      if (terminal.has(run.status)) return run;
      this.db
        .prepare(
          "UPDATE jobs SET status='cancelled',token=NULL,lease_until=NULL WHERE run_id=? AND status IN ('queued','blocked','running')",
        )
        .run(id);
      this.db
        .prepare("UPDATE runs SET status='cancelled',finished_at=? WHERE id=?")
        .run(this.clock(), id);
      this.event(id, null, 'run.cancelled', 'Run cancelled by user');
      return this.run(id);
    });
  }
  close() {
    this.db.close();
  }
}
