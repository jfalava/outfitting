import { describe, expect, test } from "bun:test";

import { inferOutputPath, normalizeWorkerUrl } from "../src/commands/lockfiles";

describe("lockfiles command helpers", () => {
  test("infers common lockfile names", () => {
    expect(inferOutputPath("nix")).toBe("flake.lock");
    expect(inferOutputPath("bun")).toBe("bun.lock");
    expect(inferOutputPath("repo-bun")).toBe("bun.lock");
    expect(inferOutputPath("npm")).toBe("package-lock.json");
    expect(inferOutputPath("winget")).toBe("winget.json");
    expect(inferOutputPath("custom-kind")).toBeUndefined();
  });

  test("normalizes Worker URLs", () => {
    expect(normalizeWorkerUrl("https://example.workers.dev/")).toBe("https://example.workers.dev");
    expect(() => normalizeWorkerUrl("not a URL")).toThrow("Worker URL must be a valid URL.");
    expect(() => normalizeWorkerUrl("file:///tmp/worker")).toThrow(
      "Worker URL must use HTTP or HTTPS.",
    );
  });
});
