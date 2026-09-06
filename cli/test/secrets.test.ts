import { afterEach, describe, expect, test } from "vitest";

import { r2Credentials } from "@/fonts/keychain";
import { apiToken, baseUrl } from "@/lockfiles/keychain";
import { envValue, inAmpOrb } from "@/secrets";

const ENV_KEYS = [
  "AMP_ORB",
  "OUTFITTING_LOCKFILES_TOKEN",
  "OUTFITTING_LOCKFILES_URL",
  "OUTFITTING_S3_ENDPOINT",
  "OUTFITTING_S3_ACCESS_KEY",
  "OUTFITTING_S3_SECRET_KEY",
] as const;

const saved = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  saved.set(key, process.env[key]);
}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const key of ENV_KEYS) {
    const original = saved.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  setEnv({});
});

describe("orb environment credentials", () => {
  test("treats AMP_ORB=1 as an Amp orb", () => {
    setEnv({ AMP_ORB: "1" });
    expect(inAmpOrb()).toBe(true);
    setEnv({ AMP_ORB: undefined });
    expect(inAmpOrb()).toBe(false);
    expect(envValue("AMP_ORB")).toBeUndefined();
  });

  test("reads lockfiles credentials from env in an Amp orb", async () => {
    setEnv({
      AMP_ORB: "1",
      OUTFITTING_LOCKFILES_TOKEN: "  orb-token  ",
      OUTFITTING_LOCKFILES_URL: "https://example.workers.dev/api/",
    });
    expect(await apiToken()).toBe("orb-token");
    expect(await baseUrl()).toBe("https://example.workers.dev/api");
  });

  test("defaults the lockfiles Worker URL in an Amp orb", async () => {
    setEnv({
      AMP_ORB: "1",
      OUTFITTING_LOCKFILES_TOKEN: "orb-token",
      OUTFITTING_LOCKFILES_URL: undefined,
    });
    expect(await baseUrl()).toBe("https://outfitting.jfa.dev/api");
  });

  test("requires OUTFITTING_LOCKFILES_TOKEN in an Amp orb", async () => {
    setEnv({
      AMP_ORB: "1",
      OUTFITTING_LOCKFILES_TOKEN: undefined,
    });
    await expect(apiToken()).rejects.toThrow(
      "OUTFITTING_LOCKFILES_TOKEN is required in an Amp orb.",
    );
  });

  test("reads R2 credentials from env in an Amp orb", async () => {
    setEnv({
      AMP_ORB: "1",
      OUTFITTING_S3_ENDPOINT: "0123456789abcdef0123456789abcdef",
      OUTFITTING_S3_ACCESS_KEY: " access ",
      OUTFITTING_S3_SECRET_KEY: " secret ",
    });
    expect(await r2Credentials()).toEqual({
      endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
  });

  test("requires R2 env vars in an Amp orb", async () => {
    setEnv({
      AMP_ORB: "1",
      OUTFITTING_S3_ENDPOINT: undefined,
      OUTFITTING_S3_ACCESS_KEY: "access",
      OUTFITTING_S3_SECRET_KEY: "secret",
    });
    await expect(r2Credentials()).rejects.toThrow(
      "OUTFITTING_S3_ENDPOINT is required in an Amp orb.",
    );

    setEnv({
      AMP_ORB: "1",
      OUTFITTING_S3_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
      OUTFITTING_S3_ACCESS_KEY: undefined,
      OUTFITTING_S3_SECRET_KEY: "secret",
    });
    await expect(r2Credentials()).rejects.toThrow(
      "OUTFITTING_S3_ACCESS_KEY and OUTFITTING_S3_SECRET_KEY are required in an Amp orb.",
    );
  });
});
