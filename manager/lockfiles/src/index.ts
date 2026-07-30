import { Hono } from "hono";

interface Bindings {
  OUTFITTING_LOCKFILES_TOKEN: SecretsStoreSecret;
  DB: D1Database;
  LOCKFILES: KVNamespace;
}

interface LockfileRow {
  hash: string;
  size: number;
  created_at: string;
}

interface KindRow {
  kind: string;
}

type PromotionResult = { status: "ok" } | { currentHash: string | null; status: "stale" };

interface PromotionInput {
  content: ArrayBuffer;
  hash: string;
  kind: string;
  machine: string;
  parentHash?: string;
  size: number;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

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

const app = new Hono<{ Bindings: Bindings }>();

export function lockfileKey(machine: string, kind: string, hash: string): string {
  return `lockfile:${machine}:${kind}:${hash}`;
}

export async function sha256(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function currentHead(env: Bindings, machine: string, kind: string): Promise<string | null> {
  const current = await env.DB.prepare(
    `SELECT hash
       FROM lockfile_heads
      WHERE machine = ? AND kind = ?`,
  )
    .bind(machine, kind)
    .first<{ hash: string }>();
  return current?.hash ?? null;
}

async function storeAndPromote(
  env: Bindings,
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
    env.DB.prepare(ADVANCE_HEAD_SQL).bind(machine, kind, hash, parent, machine, kind, parent),
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

async function deleteLockfileVersion(
  env: Bindings,
  machine: string,
  kind: string,
  hash: string,
): Promise<"current" | "deleted" | "not-found"> {
  if ((await currentHead(env, machine, kind)) === hash) {
    return "current";
  }

  const existing = await env.DB.prepare(
    `SELECT id
       FROM lockfiles
      WHERE machine = ? AND kind = ? AND hash = ?`,
  )
    .bind(machine, kind, hash)
    .first<{ id: number }>();
  if (!existing) {
    return "not-found";
  }

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM lockfile_promotions
        WHERE machine = ? AND kind = ? AND hash = ?`,
    ).bind(machine, kind, hash),
    env.DB.prepare(
      `DELETE FROM lockfiles
        WHERE machine = ? AND kind = ? AND hash = ?`,
    ).bind(machine, kind, hash),
  ]);
  await env.LOCKFILES.delete(lockfileKey(machine, kind, hash));
  return "deleted";
}

app.use("*", async (c, next) => {
  const token = await c.env.OUTFITTING_LOCKFILES_TOKEN.get();
  const authorization = c.req.header("Authorization");

  if (!token || authorization !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

app.put("/lockfiles/:machine/:kind", async (c) => {
  const { kind, machine } = c.req.param();
  let parentHash: string | undefined;
  try {
    parentHash = parseIfMatch(c.req.header("If-Match"));
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Invalid If-Match header." },
      400,
    );
  }

  const content = await c.req.arrayBuffer();
  const hash = await sha256(content);
  const size = content.byteLength;
  const result = await storeAndPromote(c.env, {
    content,
    hash,
    kind,
    machine,
    parentHash,
    size,
  });
  if (result.status === "stale") {
    return c.json(
      {
        error: "Remote lockfile changed since it was pulled.",
        current_hash: result.currentHash,
      },
      412,
    );
  }

  return c.json({ hash, size });
});

app.get("/lockfiles/:machine/:kind/history", async (c) => {
  const machine = c.req.param("machine");
  const kind = c.req.param("kind");
  const { results } = await c.env.DB.prepare(
    `SELECT promotions.hash, lockfiles.size, promotions.created_at
       FROM lockfile_promotions AS promotions
       JOIN lockfiles
         ON lockfiles.machine = promotions.machine
        AND lockfiles.kind = promotions.kind
        AND lockfiles.hash = promotions.hash
      WHERE promotions.machine = ? AND promotions.kind = ?
      ORDER BY promotions.created_at DESC, promotions.id DESC`,
  )
    .bind(machine, kind)
    .all<LockfileRow>();

  return c.json(results);
});

app.get("/lockfiles/:machine/:kind", async (c) => {
  const machine = c.req.param("machine");
  const kind = c.req.param("kind");
  const latest = await c.env.DB.prepare(
    `SELECT heads.hash, lockfiles.size, heads.updated_at AS created_at
       FROM lockfile_heads AS heads
       JOIN lockfiles
         ON lockfiles.machine = heads.machine
        AND lockfiles.kind = heads.kind
        AND lockfiles.hash = heads.hash
      WHERE heads.machine = ? AND heads.kind = ?`,
  )
    .bind(machine, kind)
    .first<LockfileRow>();

  if (!latest) {
    return c.json({ error: "Lockfile not found" }, 404);
  }

  const content = await c.env.LOCKFILES.get(lockfileKey(machine, kind, latest.hash), "arrayBuffer");

  if (!content) {
    console.error(`Missing KV blob for ${machine}/${kind}/${latest.hash}`);
    return c.json({ error: "Lockfile blob is unavailable" }, 500);
  }

  return c.body(content, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    ETag: `"${latest.hash}"`,
  });
});

app.get("/lockfiles/:machine", async (c) => {
  const machine = c.req.param("machine");
  const { results } = await c.env.DB.prepare(
    `SELECT kind
       FROM lockfile_heads
      WHERE machine = ?
      ORDER BY kind ASC`,
  )
    .bind(machine)
    .all<KindRow>();

  return c.json(results.map(({ kind }) => kind));
});

app.delete("/lockfiles/:machine/:kind/:hash", async (c) => {
  const machine = c.req.param("machine");
  const kind = c.req.param("kind");
  const hash = c.req.param("hash");
  if (!SHA256_PATTERN.test(hash)) {
    return c.json({ error: "Invalid SHA-256 hash" }, 400);
  }

  const result = await deleteLockfileVersion(c.env, machine, kind, hash);
  if (result === "current") {
    return c.json({ error: "Cannot delete the current lockfile version" }, 409);
  }
  if (result === "not-found") {
    return c.json({ error: "Lockfile version not found" }, 404);
  }

  return c.body(null, 204);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

export { app };
export default app;
