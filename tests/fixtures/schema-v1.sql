PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS workflows(id TEXT PRIMARY KEY, definition TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), definition TEXT NOT NULL, input TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), step_id TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, lease_until INTEGER, token TEXT, worker TEXT, output TEXT, error TEXT, UNIQUE(run_id,step_id));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), step_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS queue_lookup ON jobs(status, available_at);
      CREATE INDEX IF NOT EXISTS events_run ON events(run_id,id);
      PRAGMA user_version=1;
