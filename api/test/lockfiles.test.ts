import { describe, expect, test } from "vitest";

import { app, lockfileKey, parseIfMatch, sha256 } from "@/index";

describe("lockfile helpers", () => {
  test("builds the specified content-addressed KV key", () => {
    expect(lockfileKey("jfalava:x64-wsl", "nix", "abc123")).toBe(
      "lockfile:jfalava:x64-wsl:nix:abc123",
    );
  });

  test("hashes raw bytes with SHA-256", async () => {
    const content = await new Blob(["hello"]).arrayBuffer();
    expect(await sha256(content)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("parses a quoted SHA-256 If-Match precondition", () => {
    const hash = "a".repeat(64);
    expect(parseIfMatch(`"${hash}"`)).toBe(hash);
    expect(parseIfMatch(undefined)).toBeUndefined();
    expect(() => parseIfMatch(hash)).toThrow("quoted lowercase SHA-256");
    expect(() => parseIfMatch('"ABC"')).toThrow("quoted lowercase SHA-256");
  });
});

describe("authentication", () => {
  const partialEnv = {
    OUTFITTING_LOCKFILES_TOKEN: {
      get: async () => "correct-token",
    },
  } satisfies Pick<Env, "OUTFITTING_LOCKFILES_TOKEN">;
  const env = partialEnv as Env;

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

  test("accepts the configured bearer token", async () => {
    const response = await app.request(
      "http://worker.test/not-found",
      { headers: { Authorization: "Bearer correct-token" } },
      env,
    );
    expect(response.status).toBe(404);
  });
});
