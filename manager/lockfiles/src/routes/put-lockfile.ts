import { parseIfMatch, sha256, storeAndPromote } from "../lockfiles";
import type { LockfilesApp } from "../types";

export function registerPutLockfileRoute(app: LockfilesApp): void {
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
}
