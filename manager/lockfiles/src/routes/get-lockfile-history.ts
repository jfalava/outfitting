import type { LockfileRow, LockfilesApp } from "../types";

export function registerGetLockfileHistoryRoute(app: LockfilesApp): void {
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
}
