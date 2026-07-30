import { lockfileKey } from "../lockfiles";
import type { LockfileRow, LockfilesApp } from "../types";

export function registerGetLockfileRoute(app: LockfilesApp): void {
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

    const content = await c.env.LOCKFILES.get(
      lockfileKey(machine, kind, latest.hash),
      "arrayBuffer",
    );

    if (!content) {
      console.error(`Missing KV blob for ${machine}/${kind}/${latest.hash}`);
      return c.json({ error: "Lockfile blob is unavailable" }, 500);
    }

    return c.body(content, 200, {
      "Content-Type": "text/plain; charset=utf-8",
      ETag: `"${latest.hash}"`,
    });
  });
}
