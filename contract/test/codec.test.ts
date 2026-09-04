import { describe, expect, test } from "vitest";

import { decodeResponse, encodeResponse, ErrorBody, PushResponse, Sha256 } from "../src/index";

describe("encodeResponse", () => {
  test("round-trips a push response", () => {
    const hash = "a".repeat(64);
    const value = { hash, size: 12 };
    expect(encodeResponse(PushResponse, value)).toEqual(value);
  });

  test("rejects an invalid hash at encode time", () => {
    expect(() => encodeResponse(PushResponse, { hash: "nope", size: 1 })).toThrow();
  });
});

describe("decodeResponse", () => {
  test("decodes a valid error body", () => {
    expect(decodeResponse(ErrorBody, { error: "Unauthorized" }, "error")).toEqual({
      error: "Unauthorized",
    });
  });

  test("returns undefined for garbage instead of throwing", () => {
    expect(decodeResponse(ErrorBody, { not: "error" }, "error")).toBeUndefined();
    expect(decodeResponse(PushResponse, null, "push")).toBeUndefined();
  });

  test("accepts lowercase SHA-256 and rejects other forms", () => {
    const hash = "0123456789abcdef".repeat(4);
    expect(decodeResponse(Sha256, hash, "sha")).toBe(hash);
    expect(decodeResponse(Sha256, hash.toUpperCase(), "sha")).toBeUndefined();
    expect(decodeResponse(Sha256, "abc", "sha")).toBeUndefined();
  });
});
