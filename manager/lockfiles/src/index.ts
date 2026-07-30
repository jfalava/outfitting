import { Hono } from "hono";

interface Bindings {
  OUTFITTING_LOCKFILES_TOKEN: string;
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

const app = new Hono<{ Bindings: Bindings }>();

export function lockfileKey(machine: string, kind: string, hash: string): string {
  return `lockfile:${machine}:${kind}:${hash}`;
}

export async function sha256(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

app.use("*", async (c, next) => {
  const token = c.env.OUTFITTING_LOCKFILES_TOKEN;
  const authorization = c.req.header("Authorization");

  if (!token || authorization !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

app.put("/lockfiles/:machine/:kind", async (c) => {
  const machine = c.req.param("machine");
  const kind = c.req.param("kind");
  const content = await c.req.arrayBuffer();
  const hash = await sha256(content);
  const size = content.byteLength;

  const existing = await c.env.DB.prepare(
    `SELECT id
       FROM lockfiles
      WHERE machine = ? AND kind = ? AND hash = ?`,
  )
    .bind(machine, kind, hash)
    .first<{ id: number }>();

  if (existing) {
    return c.json({ hash, size });
  }

  await c.env.LOCKFILES.put(lockfileKey(machine, kind, hash), content);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO lockfiles (machine, kind, hash, size)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(machine, kind, hash, size)
    .run();

  return c.json({ hash, size });
});

app.get("/lockfiles/:machine/:kind/history", async (c) => {
  const machine = c.req.param("machine");
  const kind = c.req.param("kind");
  const { results } = await c.env.DB.prepare(
    `SELECT hash, size, created_at
       FROM lockfiles
      WHERE machine = ? AND kind = ?
      ORDER BY created_at DESC, id DESC`,
  )
    .bind(machine, kind)
    .all<LockfileRow>();

  return c.json(results);
});

app.get("/lockfiles/:machine/:kind", async (c) => {
  const machine = c.req.param("machine");
  const kind = c.req.param("kind");
  const latest = await c.env.DB.prepare(
    `SELECT hash, size, created_at
       FROM lockfiles
      WHERE machine = ? AND kind = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
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
    `SELECT DISTINCT kind
       FROM lockfiles
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
  const existing = await c.env.DB.prepare(
    `SELECT id
       FROM lockfiles
      WHERE machine = ? AND kind = ? AND hash = ?`,
  )
    .bind(machine, kind, hash)
    .first<{ id: number }>();

  if (!existing) {
    return c.json({ error: "Lockfile version not found" }, 404);
  }

  await c.env.DB.prepare(
    `DELETE FROM lockfiles
      WHERE machine = ? AND kind = ? AND hash = ?`,
  )
    .bind(machine, kind, hash)
    .run();
  await c.env.LOCKFILES.delete(lockfileKey(machine, kind, hash));

  return c.body(null, 204);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

export { app };
export default app;
