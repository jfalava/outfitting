import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_DEPLOY_CONFIG,
  deployConfigToEnv,
  loadDeployConfig,
} from "../src/deploy-config";

const ENV_KEYS = [
  "OUTFITTING_STACK_NAME",
  "OUTFITTING_KV_TITLE",
  "OUTFITTING_DB_NAME",
  "OUTFITTING_PRIVATE_FONTS_BUCKET",
  "OUTFITTING_ROUTER_NAME",
  "OUTFITTING_API_NAME",
  "OUTFITTING_DOCS_NAME",
  "OUTFITTING_DOCS_ASSETS_NAME",
  "OUTFITTING_INSTALLER_NAME",
  "OUTFITTING_DOMAIN",
  "OUTFITTING_DEPLOY_DOCS",
  "OUTFITTING_DEPLOY_CONFIG",
  "OUTFITTING_INSTALLER_HOSTS",
] as const;

function withCleanEnv(run: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("defaults without file or env", () => {
  withCleanEnv(() => {
    const config = loadDeployConfig({
      configPath: join(tmpdir(), "missing-outfitting-deploy.json"),
    });
    expect(config.workers.router).toBe(DEFAULT_DEPLOY_CONFIG.workers.router);
    expect(config.docs).toBe(true);
    expect(config.domain).toBe(DEFAULT_DEPLOY_CONFIG.domain);
    expect(config.stackName).toBe(DEFAULT_DEPLOY_CONFIG.stackName);
    expect(config.workers.api).toBe("outfitting-api");
  });
});

test("file supplies domain, docs false, and worker names", () => {
  withCleanEnv(() => {
    const dir = mkdtempSync(join(tmpdir(), "outfitting-deploy-"));
    const path = join(dir, "outfitting.deploy.json");
    writeFileSync(
      path,
      JSON.stringify({
        domain: "outfitting.example.com",
        docs: false,
        stackName: "my-stack",
        database: "my-db",
        kv: "my-kv",
        workers: {
          router: "r1",
          api: "a1",
          docs: "d1",
          docsAssets: "da1",
          installer: "i1",
        },
      }),
    );
    const config = loadDeployConfig({ configPath: path });
    expect(config.domain).toBe("outfitting.example.com");
    expect(config.docs).toBe(false);
    expect(config.stackName).toBe("my-stack");
    expect(config.databaseName).toBe("my-db");
    expect(config.kvTitle).toBe("my-kv");
    expect(config.workers).toEqual({
      router: "r1",
      api: "a1",
      docs: "d1",
      docsAssets: "da1",
      installer: "i1",
    });
    expect(config.configPath).toBe(path);
  });
});

test("env beats file", () => {
  withCleanEnv(() => {
    const dir = mkdtempSync(join(tmpdir(), "outfitting-deploy-"));
    const path = join(dir, "outfitting.deploy.json");
    writeFileSync(path, JSON.stringify({ stackName: "from-file", docs: false }));
    process.env.OUTFITTING_STACK_NAME = "from-env";
    process.env.OUTFITTING_DEPLOY_DOCS = "1";
    const config = loadDeployConfig({ configPath: path });
    expect(config.stackName).toBe("from-env");
    expect(config.docs).toBe(true);
  });
});

test("overrides beat file and env", () => {
  withCleanEnv(() => {
    const dir = mkdtempSync(join(tmpdir(), "outfitting-deploy-"));
    const path = join(dir, "outfitting.deploy.json");
    writeFileSync(path, JSON.stringify({ domain: "from-file.example", docs: true }));
    process.env.OUTFITTING_DOMAIN = "from-env.example";
    const config = loadDeployConfig({
      configPath: path,
      overrides: { domain: "from-flag.example", docs: false },
    });
    expect(config.domain).toBe("from-flag.example");
    expect(config.docs).toBe(false);
  });
});

test("deployConfigToEnv encodes docs and domain", () => {
  const env = deployConfigToEnv({
    ...DEFAULT_DEPLOY_CONFIG,
    domain: "x.example",
    docs: false,
    configPath: undefined,
  });
  expect(env.OUTFITTING_DEPLOY_DOCS).toBe("0");
  expect(env.OUTFITTING_DOMAIN).toBe("x.example");
  expect(env.OUTFITTING_ROUTER_NAME).toBe("outfitting-router");
  expect(env.OUTFITTING_API_NAME).toBe("outfitting-api");
});

test("empty OUTFITTING_DOMAIN clears default domain", () => {
  withCleanEnv(() => {
    process.env.OUTFITTING_DOMAIN = "";
    const config = loadDeployConfig({
      configPath: join(tmpdir(), "missing-outfitting-deploy.json"),
    });
    expect(config.domain).toBeUndefined();
  });
});

test("rejects non-object config file", () => {
  withCleanEnv(() => {
    const dir = mkdtempSync(join(tmpdir(), "outfitting-deploy-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, "[1,2,3]");
    expect(() => loadDeployConfig({ configPath: path })).toThrow(/JSON object/);
  });
});
