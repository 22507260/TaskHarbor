import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { workflowSchema, samples } from './definition.js';
import { migrate } from './migrations.js';
import { historyQuery, decodeCursor, encodeCursor } from './history.js';
import { rerunSchema, requestHash } from './rerun.js';
import { eventQuery, eventCursor, encodeEventCursor } from './events.js';

const terminal = new Set(['succeeded', 'failed', 'cancelled']);
export class Store {
  constructor(
    path = process.env.TASKHARBOR_DB || resolve('.data/taskharbor.db'),
    clock = Date.now,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.clock = clock;
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.function('search_fold', { deterministic: true }, (value) =>
      String(value ?? '')
        .normalize('NFKC')
        .toLowerCase(),
    );
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    try {
      migrate(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  transaction(fn, mode = 'IMMEDIATE') {
    this.db.exec(`BEGIN ${mode}`);
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
    const insert = () => {
      const encoded = JSON.stringify(definition),
        now = this.clock();
      this.db
        .prepare('INSERT INTO workflows(id,definition,created_at,version) VALUES(?,?,?,1)')
        .run(id, encoded, now);
      this.db.prepare('INSERT INTO workflow_revisions VALUES(?,1,?,?)').run(id, encoded, now);
      return this.workflow(id);
    };
    return this.db.isTransaction ? insert() : this.transaction(insert);
  }
  workflow(id) {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id=?').get(id);
    return row ? { id: row.id, version: row.version, ...JSON.parse(row.definition) } : null;
  }
  workflows() {
    return this.db
      .prepare('SELECT id FROM workflows ORDER BY created_at,rowid')
      .all()
      .map((row) => this.workflow(row.id));
  }
  revisions(id) {
    if (!this.workflow(id)) return null;
    return this.db
      .prepare('SELECT * FROM workflow_revisions WHERE workflow_id=? ORDER BY version DESC')
      .all(id)
      .map((row) => ({
        version: row.version,
        created_at: row.created_at,
        definition: JSON.parse(row.definition),
      }));
  }
  updateWorkflow(id, expectedVersion, body) {
    const definition = workflowSchema.parse(body),
      encoded = JSON.stringify(definition);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM workflows WHERE id=?').get(id);
      if (!row) return null;
      if (row.version !== expectedVersion) {
        const error = new Error(
          `Workflow changed to version ${row.version}. Reload the latest version before saving.`,
        );
        error.statusCode = 409;
        throw error;
      }
      if (row.definition === encoded) return this.workflow(id);
      const version = row.version + 1;
      this.db
        .prepare('UPDATE workflows SET definition=?,version=? WHERE id=?')
        .run(encoded, version, id);
      this.db
        .prepare('INSERT INTO workflow_revisions VALUES(?,?,?,?)')
        .run(id, version, encoded, this.clock());
      return this.workflow(id);
    });
  }
  seed() {
    this.transaction(() => {
      if (!this.workflows().length) samples.forEach((x) => this.createWorkflow(x));
    });
  }
  start(workflowId, input = {}) {
    return this.transaction(() => {
      const workflow = this.db.prepare('SELECT * FROM workflows WHERE id=?').get(workflowId);
      if (!workflow) return null;
      return this.createRun(workflowId, workflow.definition, workflow.version, input);
    });
  }
  // Internal primitive: callers hold a write transaction so the snapshot,
  // fresh jobs, lineage and idempotency receipt commit together.
  createRun(workflowId, encoded, version, input, parentRunId = null) {
    if (!this.db.isTransaction) throw new Error('createRun requires a transaction');
    const id = randomUUID(),
      now = this.clock(),
      definition = JSON.parse(encoded);
    this.db
      .prepare(
        'INSERT INTO runs(id,workflow_id,definition,input,status,created_at,workflow_version,parent_run_id) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(id, workflowId, encoded, JSON.stringify(input), 'queued', now, version, parentRunId);
    for (const step of definition.steps)
      this.db
        .prepare('INSERT INTO jobs(id,run_id,step_id,status,available_at) VALUES(?,?,?,?,?)')
        .run(randomUUID(), id, step.id, step.dependsOn.length ? 'blocked' : 'queued', now);
    this.event(id, null, 'run.created', 'Run queued');
    if (parentRunId)
      this.event(
        id,
        null,
        'run.rerun',
        `Created from run ${parentRunId} using workflow v${version}`,
      );
    return this.run(id);
  }
  rerun(sourceId, body) {
    const request = rerunSchema.parse(body),
      hash = requestHash(request);
    return this.transaction(() => {
      const receipt = this.db
        .prepare('SELECT * FROM run_requests WHERE source_run_id=? AND request_id=?')
        .get(sourceId, request.requestId);
      if (receipt) {
        if (receipt.request_hash !== hash) {
          const error = new Error(
            'This requestId was already used with a different rerun request.',
          );
          error.statusCode = 409;
          throw error;
        }
        return { run: this.run(receipt.run_id), reused: true };
      }
      const source = this.db.prepare('SELECT * FROM runs WHERE id=?').get(sourceId);
      if (!source) return null;
      if (!terminal.has(source.status)) {
        const error = new Error('Wait for the source run to finish or cancel it before rerunning.');
        error.statusCode = 409;
        throw error;
      }
      const workflow =
        request.mode === 'latest'
          ? this.db.prepare('SELECT * FROM workflows WHERE id=?').get(source.workflow_id)
          : null;
      if (request.mode === 'latest' && !workflow) {
        const error = new Error('Workflow not found');
        error.statusCode = 404;
        throw error;
      }
      if (workflow && workflow.version !== request.expectedVersion) {
        const error = new Error(
          `Workflow changed to version ${workflow.version}. Reload the latest version before rerunning.`,
        );
        error.statusCode = 409;
        throw error;
      }
      const run = this.createRun(
        source.workflow_id,
        workflow?.definition ?? source.definition,
        workflow?.version ?? source.workflow_version,
        request.input ?? JSON.parse(source.input),
        sourceId,
      );
      this.db
        .prepare('INSERT INTO run_requests VALUES(?,?,?,?)')
        .run(sourceId, request.requestId, hash, run.id);
      return { run, reused: false };
    });
  }
  runs() {
    return this.db
      .prepare('SELECT id FROM runs ORDER BY created_at DESC,rowid DESC LIMIT 100')
      .all()
      .map((x) => this.run(x.id, false));
  }
  runHistory(query = {}) {
    const filters = historyQuery.parse(query),
      cursor = decodeCursor(filters.cursor, filters);
    return this.transaction(() => {
      const snapshot =
        cursor?.snapshot ??
        filters.snapshot ??
        this.db.prepare('SELECT COALESCE(MAX(rowid),0) AS value FROM runs').get().value;
      const clauses = ['r.rowid<=?'],
        params = [snapshot];
      if (filters.status) {
        clauses.push('r.status=?');
        params.push(filters.status);
      }
      if (filters.workflowId) {
        clauses.push('r.workflow_id=?');
        params.push(filters.workflowId);
      }
      if (filters.q) {
        // instr searches literal text: percent, underscore and quotes are not SQL wildcards.
        clauses.push(
          "(instr(search_fold(r.id),search_fold(?))>0 OR instr(search_fold(json_extract(r.definition,'$.name')),search_fold(?))>0)",
        );
        params.push(filters.q, filters.q);
      }
      const where = clauses.join(' AND ');
      const total = this.db
        .prepare(`SELECT COUNT(*) AS value FROM runs r WHERE ${where}`)
        .get(...params).value;
      const pageWhere = cursor
        ? `${where} AND (r.created_at<? OR (r.created_at=? AND r.id<?))`
        : where;
      const pageParams = cursor ? [...params, cursor.time, cursor.time, cursor.id] : params;
      const rows = this.db
        .prepare(
          `SELECT r.id,r.workflow_id,r.workflow_version,r.parent_run_id,r.status,r.created_at,r.finished_at,
        json_extract(r.definition,'$.name') AS workflow_name,
        (SELECT COUNT(*) FROM jobs j WHERE j.run_id=r.id) AS step_count,
        (SELECT COUNT(*) FROM jobs j WHERE j.run_id=r.id AND j.status='succeeded') AS completed_steps
        FROM runs r WHERE ${pageWhere} ORDER BY r.created_at DESC,r.id DESC LIMIT ?`,
        )
        .all(...pageParams, filters.limit + 1);
      const hasMore = rows.length > filters.limit,
        items = rows.slice(0, filters.limit);
      return {
        items,
        total,
        snapshot,
        nextCursor: hasMore ? encodeCursor(items.at(-1), snapshot, filters) : null,
      };
    }, 'DEFERRED');
  }
  overview() {
    return this.transaction(() => {
      const counts = this.db
        .prepare(
          `SELECT COUNT(*) AS total,
        COALESCE(SUM(status IN ('queued','running')),0) AS active,
        COALESCE(SUM(status='succeeded'),0) AS succeeded,
        COALESCE(SUM(status IN ('succeeded','failed')),0) AS completed FROM runs`,
        )
        .get();
      const latestByWorkflow = this.db
        .prepare(
          `SELECT w.id AS workflow_id,
        (SELECT r.status FROM runs r WHERE r.workflow_id=w.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS status
        FROM workflows w`,
        )
        .all()
        .filter((row) => row.status !== null);
      return { ...counts, latestByWorkflow };
    }, 'DEFERRED');
  }
  eventHistory(runId, query = {}) {
    const filters = eventQuery.parse(query),
      cursor = eventCursor(runId, filters);
    return this.transaction(() => {
      if (!this.db.prepare('SELECT id FROM runs WHERE id=?').get(runId)) return null;
      const snapshot =
        cursor?.snapshot ??
        this.db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM events WHERE run_id=?').get(runId)
          .id;
      const clauses = ['run_id=?', 'id<=?'],
        args = [runId, snapshot];
      if (filters.step) {
        clauses.push('step_id=?');
        args.push(filters.step);
      }
      const groups = {
        errors: ['job.failed', 'run.failed'],
        retries: ['job.retry'],
        recovery: ['job.recovered'],
      };
      if (filters.category !== 'all') {
        const types = groups[filters.category];
        clauses.push(`type IN (${types.map(() => '?').join(',')})`);
        args.push(...types);
      }
      if (filters.q) {
        clauses.push(
          "instr(search_fold(message || char(10) || type || char(10) || COALESCE(step_id,'workflow')),search_fold(?))>0",
        );
        args.push(filters.q);
      }
      const where = clauses.join(' AND ');
      const total = this.db
        .prepare(`SELECT COUNT(*) AS count FROM events WHERE ${where}`)
        .get(...args).count;
      const recorded = this.db
        .prepare('SELECT COUNT(*) AS count FROM events WHERE run_id=? AND id<=?')
        .get(runId, snapshot).count;
      const direction = filters.order === 'newest' ? 'DESC' : 'ASC';
      const pageWhere = cursor
        ? `${where} AND id ${filters.order === 'newest' ? '<' : '>'} ?`
        : where;
      const pageArgs = cursor ? [...args, cursor.id] : args;
      const rows = this.db
        .prepare(`SELECT * FROM events WHERE ${pageWhere} ORDER BY id ${direction} LIMIT ?`)
        .all(...pageArgs, filters.limit + 1);
      const items = rows.slice(0, filters.limit);
      return {
        items,
        total,
        recorded,
        snapshot,
        nextCursor:
          rows.length > filters.limit
            ? encodeEventCursor(runId, filters, items.at(-1).id, snapshot)
            : null,
      };
    }, 'DEFERRED');
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
