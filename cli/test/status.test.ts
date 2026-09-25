import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import { readStatus } from "@/commands/status";
import { loadConfig } from "@/config";
import { readWindowsLock, writeWindowsLock } from "@/update/windows-lock";

afterEach(() => vi.unstubAllEnvs());

test("status reports defaults without creating any state", async () => {
  vi.stubEnv("OUTFITTING_REPO", "");
  const root = await mkdtemp(join(tmpdir(), "outfitting-status-"));
  try {
    const absent = join(root, "not-created");
    const config = await loadConfig({ stateRoot: absent });
    for (const platform of ["macos", "windows", "linux"] as const) {
      const output = await readStatus(platform, { config });
      expect(output).toContain(`Platform: ${platform}`);
      expect(output).toContain(`Config: ${join(absent, "config.toml")}`);
      expect(output).toContain("Source checkout: not configured");
      expect(output).toContain("Source mode: not configured");
      expect(output).toContain(`Machine ID: ${config.machineId}`);
    }
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status preserves saved profiles and distinguishes sparse, missing and dirty sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "outfitting-status-source-"));
  try {
    await writeFile(
      join(root, "config.toml"),
      `schema = 1\n[source]\npath = ${JSON.stringify(root)}\n[linux]\nprofile = "linux-work"\n[profiles.work.windows.winget]\nmanifest = "packages/work.txt"\n[profiles.dev.windows.winget]\nmanifest = "packages/dev.txt"\n[profiles.linux-work.linux.apt]\nmanifest = "packages/linux.txt"\n`,
    );
    const config = await loadConfig({ stateRoot: root });
    const lock = await readWindowsLock(config);
    lock.profiles = ["work", "dev"];
    await writeWindowsLock(lock, { root });
    const before = await readFile(join(root, "windows.lock.json"), "utf8");
    expect(await readStatus("windows", { config, envRepo: root })).toContain("Profile: work,dev");
    expect(await readStatus("linux", { config, envRepo: root })).toContain(
      "local source (no Git metadata)",
    );
    expect(await readStatus("linux", { config, envRepo: join(root, "missing") })).toContain(
      "Source checkout: missing",
    );
    await mkdir(join(root, ".git"));
    const run = vi.fn(async () => ({
      code: 0,
      stdout: "## feature...origin/feature [ahead 1]\n M foo\n",
      stderr: "",
    }));
    const output = await readStatus("linux", { config, envRepo: root, run });
    expect(output).toContain("Source checkout: dirty");
    expect(output).toContain("Git: feature...origin/feature [ahead 1]");
    expect(run.mock.calls).toHaveLength(1);
    expect(await readFile(join(root, "windows.lock.json"), "utf8")).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
