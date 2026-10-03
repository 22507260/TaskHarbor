// Every migration and its version marker commit atomically. Concurrent API/worker
// startups serialize here before reading the version, avoiding duplicate ALTERs.
export function migrate(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    let version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) throw new Error(`Unsupported database version: ${version}`);
    if (version === 0) {
      db.exec(`
        CREATE TABLE workflows(id TEXT PRIMARY KEY, definition TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE runs(id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), definition TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER);
        CREATE TABLE jobs(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), step_id TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, lease_until INTEGER, token TEXT, worker TEXT, output TEXT, error TEXT, UNIQUE(run_id,step_id));
        CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), step_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE workers(id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
        CREATE INDEX queue_lookup ON jobs(status, available_at);
        CREATE INDEX events_run ON events(run_id,id);
        PRAGMA user_version=1;
      `);
      version = 1;
    }
    if (version === 1) {
      db.exec(`
        ALTER TABLE workflows ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE runs ADD COLUMN workflow_version INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE workflow_revisions(
          workflow_id TEXT NOT NULL REFERENCES workflows(id),
          version INTEGER NOT NULL, definition TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY(workflow_id,version)
        );
        INSERT INTO workflow_revisions SELECT id,1,definition,created_at FROM workflows;
        PRAGMA user_version=2;
      `);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
