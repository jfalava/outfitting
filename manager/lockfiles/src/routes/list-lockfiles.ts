import type { KindRow, LockfilesApp } from "../types";

export function registerListLockfilesRoute(app: LockfilesApp): void {
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
}
