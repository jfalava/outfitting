import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  autoMachineId,
  configFilePath,
  defaultStateRoot,
  ensureStateRoot,
  hostSystemTriple,
  loadConfig,
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
    expect(config.configPath).toBe(configFilePath(root));
    expect(config.machineIdOverridden).toBe(false);
    expect(config.machineId).toMatch(/^.+:.+$/);
    expect(config.source).toBeUndefined();
    expect(config.declarations).toBeUndefined();
  });

  test("reads one TOML document, resolves local source relative to it, and honors overrides", async () => {
    const root = await tempRoot();
    const configPath = join(root, "machine", "config.toml");
    await ensureStateRoot(join(root, "state"));
    await mkdir(join(root, "machine"));
    await writeFile(
      configPath,
      [
        "schema = 1",
        'machine_id = "from-file:aarch64-linux"',
        "",
        "[source]",
        'path = "../checkout"',
        "",
        "[linux]",
        'profile = "work"',
        "",
        "[profiles.work.linux.apt]",
        'manifest = "packages/apt.txt"',
      ].join("\n"),
      "utf8",
    );

    const fromFile = await loadConfig({ stateRoot: join(root, "state"), configPath });
    expect(fromFile.configPath).toBe(configPath);
    expect(fromFile.source).toEqual({ kind: "local", path: join(root, "checkout") });
    expect(fromFile.machineId).toBe("from-file:aarch64-linux");
    expect(fromFile.machineIdOverridden).toBe(true);
    expect(fromFile.linux).toEqual({ profile: "work" });
    expect(fromFile.declarations?.profiles.work?.linux?.apt).toEqual({
      manifest: "packages/apt.txt",
    });

    vi.stubEnv("OUTFITTING_MACHINE_ID", "from-env:x86_64-linux");
    const fromEnv = await loadConfig({ stateRoot: join(root, "state"), configPath });
    expect(fromEnv.machineId).toBe("from-env:x86_64-linux");
  });

  test("ignores legacy config.json and rejects malformed TOML", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "config.json"),
      JSON.stringify({ machineId: "legacy:aarch64-linux", linux: { profile: "legacy" } }),
    );
    const config = await loadConfig({ stateRoot: root });
    expect(config.machineId).not.toBe("legacy:aarch64-linux");
    expect(config.linux).toBeUndefined();

    await writeFile(join(root, "config.toml"), "schema = [not TOML");
    await expect(loadConfig({ stateRoot: root })).rejects.toThrow(/not valid TOML/);
  });

  test("rejects unsupported keys and reserved source-root declarations", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "config.toml"), "schema = 1\nextra = true\n");
    await expect(loadConfig({ stateRoot: root })).rejects.toThrow(/unsupported key/);

    await writeFile(
      join(root, "config.toml"),
      [
        "schema = 1",
        "[source]",
        'path = "."',
        "[profiles.work.linux.apt]",
        'manifest = "config.toml"',
      ].join("\n"),
    );
    await expect(loadConfig({ stateRoot: root })).rejects.toThrow(/reserved root file/);
  });
});
