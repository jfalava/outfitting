CREATE TABLE lockfiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (machine, kind, hash)
);

CREATE INDEX lockfiles_machine_kind_created_at_idx
  ON lockfiles (machine, kind, created_at DESC);
