import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  autoMachineId,
  defaultStateRoot,
  ensureStateRoot,
  hostSystemTriple,
  loadConfig,
  saveConfigFile,
  stateRoot,
} from "@/config";

const temps: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "outfitting-config-"));
  temps.push(dir);
  return dir;
}

test("Windows defaults to Local AppData; Unix and explicit state roots are unchanged", async () => {
  const home = await tempRoot();
  const localAppData = join(home, "different", "local");
  expect(defaultStateRoot(home, "win32", localAppData)).toBe(join(localAppData, "outfitting"));
  expect(defaultStateRoot(home, "win32", "")).toBe(join(home, "AppData", "Local", "outfitting"));
  expect(defaultStateRoot(home, "linux")).toBe(join(home, ".config", "outfitting"));
  vi.stubEnv("OUTFITTING_STATE_ROOT", join(home, "custom"));
  expect(stateRoot(home)).toBe(join(home, "custom"));
});

describe("machine id", () => {
  test("builds nix-style triples", () => {
    expect(hostSystemTriple("darwin", "arm64")).toBe("aarch64-darwin");
    expect(() => hostSystemTriple("darwin", "unsupported")).toThrow("Apple Silicon");
    expect(hostSystemTriple("linux", "x64")).toBe("x86_64-linux");
    expect(hostSystemTriple("win32", "x64")).toBe("x86_64-windows");
  });

  test("auto machine id is user:triple", () => {
    expect(autoMachineId("darwin", "arm64", "jfalava")).toBe("jfalava:aarch64-darwin");
  });
});

describe("loadConfig", () => {
  test("defaults without config file and has no implicit source", async () => {
    const root = await tempRoot();
    const config = await loadConfig({ stateRoot: root });
    expect(config.stateRoot).toBe(root);
    expect(config.machineIdOverridden).toBe(false);
    expect(config.machineId).toMatch(/^.+:.+$/);
    expect(config.linux).toBeUndefined();
  });

  test("reads config.json and environment overrides machine id", async () => {
    const root = await tempRoot();
    await ensureStateRoot(root);
    await saveConfigFile(
      { machineId: "from-file:aarch64-darwin", linux: { profile: "oci-agents" } },
      { stateRoot: root },
    );

    const fromFile = await loadConfig({ stateRoot: root });
    expect(fromFile.machineId).toBe("from-file:aarch64-darwin");
    expect(fromFile.machineIdOverridden).toBe(true);
    expect(fromFile.linux).toEqual({ profile: "oci-agents" });

    vi.stubEnv("OUTFITTING_MACHINE_ID", "from-env:x86_64-linux");
    const fromEnv = await loadConfig({ stateRoot: root });
    expect(fromEnv.machineId).toBe("from-env:x86_64-linux");
  });

  test("rejects invalid config.json", async () => {
    const root = await tempRoot();
    await ensureStateRoot(root);
    await writeFile(join(root, "config.json"), "not-json", "utf8");
    await expect(loadConfig({ stateRoot: root })).rejects.toThrow(/not valid JSON/);
  });

  test("saveConfigFile merges and pretty-prints supported settings", async () => {
    const root = await tempRoot();
    await saveConfigFile({ machineId: "a:b" }, { stateRoot: root });
    await saveConfigFile({ linux: { profile: "oci-agents" } }, { stateRoot: root });
    const raw = await readFile(join(root, "config.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ machineId: "a:b", linux: { profile: "oci-agents" } });
  });

  test("validates Linux profile names before persisting", async () => {
    const root = await tempRoot();
    await saveConfigFile({ linux: { profile: "oci-agents" } }, { stateRoot: root });
    expect((await loadConfig({ stateRoot: root })).linux).toEqual({ profile: "oci-agents" });
    await expect(
      saveConfigFile({ linux: { profile: "../escape" } }, { stateRoot: root }),
    ).rejects.toThrow(/invalid Linux profile/);
  });
});
