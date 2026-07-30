import { describe, expect, test } from "bun:test";

import { app, lockfileKey, sha256 } from "../src/index";

describe("lockfile helpers", () => {
  test("builds the specified content-addressed KV key", () => {
    expect(lockfileKey("jfalava:x64-wsl", "nix", "abc123")).toBe(
      "lockfile:jfalava:x64-wsl:nix:abc123",
    );
  });

  test("hashes raw bytes with SHA-256", async () => {
    const content = new TextEncoder().encode("hello").buffer;
    expect(await sha256(content)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("authentication", () => {
  const env = {
    OUTFITTING_LOCKFILES_TOKEN: "correct-token",
  } as unknown as Env;

  test("rejects a missing bearer token", async () => {
    const response = await app.request(
      "http://worker.test/lockfiles/jfalava%3Ax64-wsl",
      {},
      env,
    );
    expect(response.status).toBe(401);
  });

  test("rejects a wrong bearer token", async () => {
    const response = await app.request(
      "http://worker.test/lockfiles/jfalava%3Ax64-wsl",
      { headers: { Authorization: "Bearer wrong-token" } },
      env,
    );
    expect(response.status).toBe(401);
  });
});
