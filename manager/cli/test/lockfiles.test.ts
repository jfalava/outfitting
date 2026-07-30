import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import {
  inferOutputPath,
  isGitTrackedFile,
  normalizeSha256,
  normalizeWorkerUrl,
  pullLockfile,
} from "@/lockfiles";

const execFileAsync = promisify(execFile);

describe("lockfiles command helpers", () => {
  test("infers common lockfile names", () => {
    expect(inferOutputPath("nix")).toBe("flake.lock");
    expect(inferOutputPath("bun")).toBe("bun.lock");
    expect(inferOutputPath("homebrew-inventory")).toBe("homebrew-inventory.txt");
    expect(inferOutputPath("npm")).toBe("package-lock.json");
    expect(inferOutputPath("winget")).toBe("winget.json");
    expect(inferOutputPath("custom-kind")).toBeUndefined();
  });

  test("distinguishes repository-owned lockfiles from external lock state", async () => {
    const repository = await mkdtemp(join(tmpdir(), "outfitting-lockfiles-test-"));
    const trackedPath = join(repository, "tracked.lock");
    const untrackedPath = join(repository, "untracked.lock");

    try {
      await execFileAsync("git", ["init", "--quiet", repository]);
      await writeFile(trackedPath, "tracked");
      await writeFile(untrackedPath, "untracked");
      await execFileAsync("git", ["-C", repository, "add", "tracked.lock"]);

      expect(await isGitTrackedFile(trackedPath)).toBe(true);
      expect(await isGitTrackedFile(untrackedPath)).toBe(false);
      await expect(
        Effect.runPromise(
          pullLockfile({
            machine: "test-machine",
            kind: "test-kind",
            outPath: trackedPath,
          }),
        ),
      ).rejects.toThrow(`Refusing to overwrite Git-tracked file: ${trackedPath}`);
    } finally {
      await rm(repository, { force: true, recursive: true });
    }
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
