interface HeadRow {
  hash: string;
}

interface LockfileIdRow {
  id: number;
}

interface PromotionInput {
  content: ArrayBuffer;
  hash: string;
  kind: string;
  machine: string;
  parentHash?: string;
  size: number;
}

type PromotionResult =
  | { status: "ok" }
  | { currentHash: string | null; status: "stale" };

type DeleteLockfileResult = "current" | "deleted" | "not-found";

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const PROMOTE_HISTORY_SQL = `INSERT INTO lockfile_promotions
  (machine, kind, hash, parent_hash)
SELECT ?, ?, ?, ?
WHERE ? IS NULL OR EXISTS (
  SELECT 1 FROM lockfile_heads
  WHERE machine = ? AND kind = ? AND hash = ?
)`;

export const ADVANCE_HEAD_SQL = `INSERT INTO lockfile_heads (machine, kind, hash)
SELECT ?, ?, ?
WHERE ? IS NULL OR EXISTS (
  SELECT 1 FROM lockfile_heads
  WHERE machine = ? AND kind = ? AND hash = ?
)
ON CONFLICT (machine, kind) DO UPDATE SET
  hash = excluded.hash,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

export const DELETE_PROMOTIONS_SQL = `DELETE FROM lockfile_promotions
WHERE machine = ? AND kind = ? AND hash = ?
  AND NOT EXISTS (
    SELECT 1
      FROM lockfile_heads
     WHERE machine = ? AND kind = ? AND hash = ?
  )`;

export const DELETE_LOCKFILE_SQL = `DELETE FROM lockfiles
WHERE machine = ? AND kind = ? AND hash = ?
  AND NOT EXISTS (
    SELECT 1
      FROM lockfile_heads
     WHERE machine = ? AND kind = ? AND hash = ?
  )`;

export function lockfileKey(
  machine: string,
  kind: string,
  hash: string,
): string {
  return `lockfile:${machine}:${kind}:${hash}`;
}

export async function sha256(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function parseIfMatch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const match = /^"([0-9a-f]{64})"$/.exec(value.trim());
  if (!match) {
    throw new Error("If-Match must contain one quoted lowercase SHA-256 hash.");
  }

  return match[1];
}

async function currentHead(
  env: Env,
  machine: string,
  kind: string,
): Promise<string | null> {
  const current = await env.DB.prepare(
    `SELECT hash
       FROM lockfile_heads
      WHERE machine = ? AND kind = ?`,
  )
    .bind(machine, kind)
    .first<HeadRow>();
  return current?.hash ?? null;
}

export async function storeAndPromote(
  env: Env,
  { content, hash, kind, machine, parentHash, size }: PromotionInput,
): Promise<PromotionResult> {
  if ((await currentHead(env, machine, kind)) === hash) {
    return { status: "ok" };
  }

  await env.LOCKFILES.put(lockfileKey(machine, kind, hash), content);
  const parent = parentHash ?? null;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO lockfiles (machine, kind, hash, size)
       VALUES (?, ?, ?, ?)`,
    ).bind(machine, kind, hash, size),
    env.DB.prepare(PROMOTE_HISTORY_SQL).bind(
      machine,
      kind,
      hash,
      parent,
      parent,
      machine,
      kind,
      parent,
    ),
    env.DB.prepare(ADVANCE_HEAD_SQL).bind(
      machine,
      kind,
      hash,
      parent,
      machine,
      kind,
      parent,
    ),
  ]);
  if (results[1]?.meta.changes === 1) {
    return { status: "ok" };
  }

  const latestHash = await currentHead(env, machine, kind);
  if (latestHash === hash) {
    return { status: "ok" };
  }
  return { currentHash: latestHash, status: "stale" };
}

export async function deleteLockfileVersion(
  env: Env,
  machine: string,
  kind: string,
  hash: string,
): Promise<DeleteLockfileResult> {
  const existing = await env.DB.prepare(
    `SELECT id
       FROM lockfiles
      WHERE machine = ? AND kind = ? AND hash = ?`,
  )
    .bind(machine, kind, hash)
    .first<LockfileIdRow>();
  if (!existing) {
    return "not-found";
  }

  const results = await env.DB.batch([
    env.DB.prepare(DELETE_PROMOTIONS_SQL).bind(
      machine,
      kind,
      hash,
      machine,
      kind,
      hash,
    ),
    env.DB.prepare(DELETE_LOCKFILE_SQL).bind(
      machine,
      kind,
      hash,
      machine,
      kind,
      hash,
    ),
  ]);
  if (results[1]?.meta.changes === 0) {
    return "current";
  }

  // Keep the content-addressed KV blob: KV and D1 cannot share a transaction, so deleting it
  // here could race with a concurrent promotion that recreates the metadata for this hash.
  return "deleted";
}
