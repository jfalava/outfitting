CREATE TABLE lockfile_heads (
  machine TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (machine, kind),
  FOREIGN KEY (machine, kind, hash) REFERENCES lockfiles (machine, kind, hash)
);

CREATE TABLE lockfile_promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  parent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (machine, kind, hash) REFERENCES lockfiles (machine, kind, hash)
);

CREATE INDEX lockfile_promotions_machine_kind_created_at_idx
  ON lockfile_promotions (machine, kind, created_at DESC, id DESC);

INSERT INTO lockfile_promotions (machine, kind, hash, created_at)
SELECT machine, kind, hash, created_at
FROM lockfiles;

INSERT INTO lockfile_heads (machine, kind, hash, updated_at)
SELECT latest.machine, latest.kind, latest.hash, latest.created_at
FROM lockfiles AS latest
WHERE latest.id = (
  SELECT candidate.id
  FROM lockfiles AS candidate
  WHERE candidate.machine = latest.machine AND candidate.kind = latest.kind
  ORDER BY candidate.created_at DESC, candidate.id DESC
  LIMIT 1
);
