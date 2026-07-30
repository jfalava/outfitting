import { deleteLockfileVersion, SHA256_PATTERN } from "../lockfiles";
import type { LockfilesApp } from "../types";

export function registerDeleteLockfileRoute(app: LockfilesApp): void {
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
}
