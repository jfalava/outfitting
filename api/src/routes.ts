import type { Hono } from "hono";

import {
  deleteLockfileVersion,
  lockfileKey,
  parseIfMatch,
  sha256,
  SHA256_PATTERN,
  storeAndPromote,
} from "@/lockfiles";

export interface AppEnv {
  Bindings: Env;
}

interface LockfileRow {
  hash: string;
  size: number;
  created_at: string;
}

interface KindRow {
  kind: string;
}

export function registerLockfileRoutes(app: Hono<AppEnv>): void {
  app.put("/lockfiles/:machine/:kind", async (c) => {
    const { kind, machine } = c.req.param();
    let parentHash: string | undefined;
    try {
      parentHash = parseIfMatch(c.req.header("If-Match"));
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Invalid If-Match header.",
        },
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
    const { kind, machine } = c.req.param();
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
    const { kind, machine } = c.req.param();
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

    const content = await c.env.LOCKFILES.get(
      lockfileKey(machine, kind, latest.hash),
      "arrayBuffer",
    );
    if (!content) {
      console.error(
        JSON.stringify({
          message: "Missing lockfile KV blob",
          machine,
          kind,
          hash: latest.hash,
        }),
      );
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
    const { hash, kind, machine } = c.req.param();
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
}
