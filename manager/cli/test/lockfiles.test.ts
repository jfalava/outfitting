import { describe, expect, test } from "vitest";

import { inferOutputPath, normalizeSha256, normalizeWorkerUrl } from "../src/commands/lockfiles";

describe("lockfiles command helpers", () => {
  test("infers common lockfile names", () => {
    expect(inferOutputPath("nix")).toBe("flake.lock");
    expect(inferOutputPath("bun")).toBe("bun.lock");
    expect(inferOutputPath("repo-bun")).toBe("bun.lock");
    expect(inferOutputPath("homebrew-inventory")).toBe("homebrew-inventory.txt");
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

  test("validates and normalizes SHA-256 preconditions", () => {
    expect(normalizeSha256("A".repeat(64))).toBe("a".repeat(64));
    expect(() => normalizeSha256("abc")).toThrow("64-character SHA-256");
  });
});
