import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  autoMachineId,
  ensureStateRoot,
  hostSystemTriple,
  loadConfig,
  saveConfigFile,
} from "@/config";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  delete process.env.OUTFITTING_MACHINE_ID;
  delete process.env.OUTFITTING_MANIFEST_BASE_URL;
  delete process.env.OUTFITTING_MANIFEST_REF;
  delete process.env.OUTFITTING_STATE_ROOT;
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "outfitting-config-"));
  temps.push(dir);
  return dir;
}

describe("machine id", () => {
  test("builds nix-style triples", () => {
    expect(hostSystemTriple("darwin", "arm64")).toBe("aarch64-darwin");
    expect(hostSystemTriple("darwin", "x64")).toBe("x86_64-darwin");
    expect(hostSystemTriple("linux", "x64")).toBe("x86_64-linux");
    expect(hostSystemTriple("win32", "x64")).toBe("x86_64-windows");
  });

  test("auto machine id is user:triple", () => {
    expect(autoMachineId("darwin", "arm64", "jfalava")).toBe("jfalava:aarch64-darwin");
  });
});

describe("loadConfig", () => {
  test("defaults without config file", async () => {
    const root = await tempRoot();
    const config = await loadConfig({ stateRoot: root });
    expect(config.stateRoot).toBe(root);
    expect(config.machineIdOverridden).toBe(false);
    expect(config.machineId).toMatch(/^.+:.+$/);
    expect(config.manifest.baseUrl).toBe(
      "https://raw.githubusercontent.com/jfalava/outfitting",
    );
    expect(config.manifest.ref).toBe("main");
  });

  test("reads config.json and env overrides machine id", async () => {
    const root = await tempRoot();
    await ensureStateRoot(root);
    await saveConfigFile(
      {
        machineId: "from-file:aarch64-darwin",
        manifest: { ref: "develop" },
      },
      { stateRoot: root },
    );

    const fromFile = await loadConfig({ stateRoot: root });
    expect(fromFile.machineId).toBe("from-file:aarch64-darwin");
    expect(fromFile.machineIdOverridden).toBe(true);
    expect(fromFile.manifest.ref).toBe("develop");

    process.env.OUTFITTING_MACHINE_ID = "from-env:x86_64-linux";
    process.env.OUTFITTING_MANIFEST_REF = "v1";
    const fromEnv = await loadConfig({ stateRoot: root });
    expect(fromEnv.machineId).toBe("from-env:x86_64-linux");
    expect(fromEnv.manifest.ref).toBe("v1");
  });

  test("rejects invalid config.json", async () => {
    const root = await tempRoot();
    await ensureStateRoot(root);
    await writeFile(join(root, "config.json"), "not-json", "utf8");
    await expect(loadConfig({ stateRoot: root })).rejects.toThrow(/not valid JSON/);
  });

  test("saveConfigFile merges and pretty-prints", async () => {
    const root = await tempRoot();
    await saveConfigFile({ machineId: "a:b" }, { stateRoot: root });
    await saveConfigFile({ manifest: { ref: "main" } }, { stateRoot: root });
    const raw = await readFile(join(root, "config.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({
      machineId: "a:b",
      manifest: { ref: "main" },
    });
  });
});
