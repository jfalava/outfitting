import { describe, expect, test } from "vitest";

import {
  decodeResponse,
  encodeResponse,
  HistoryResponse,
  KindsResponse,
  StalePushBody,
} from "../src/index";

const hash = "b".repeat(64);

describe("lockfiles response schemas", () => {
  test("encodes and decodes history rows", () => {
    const rows = [{ hash, size: 3, created_at: "2026-01-01T00:00:00.000Z" }];
    expect(encodeResponse(HistoryResponse, rows)).toEqual(rows);
    expect(decodeResponse(HistoryResponse, rows, "history")).toEqual(rows);
  });

  test("rejects history entries missing created_at", () => {
    expect(decodeResponse(HistoryResponse, [{ hash, size: 1 }], "history")).toBeUndefined();
  });

  test("encodes kinds as a string array", () => {
    expect(encodeResponse(KindsResponse, ["bun", "nix"])).toEqual(["bun", "nix"]);
    expect(decodeResponse(KindsResponse, ["bun"], "kinds")).toEqual(["bun"]);
    expect(decodeResponse(KindsResponse, [{ kind: "bun" }], "kinds")).toBeUndefined();
  });

  test("requires current_hash on stale push bodies (hash or null)", () => {
    const body = { error: "Remote lockfile changed since it was pulled.", current_hash: hash };
    expect(encodeResponse(StalePushBody, body)).toEqual(body);
    expect(
      encodeResponse(StalePushBody, {
        error: "Remote lockfile changed since it was pulled.",
        current_hash: null,
      }),
    ).toEqual({
      error: "Remote lockfile changed since it was pulled.",
      current_hash: null,
    });
    expect(
      decodeResponse(StalePushBody, { error: "stale", current_hash: "short" }, "stale"),
    ).toBeUndefined();
  });
});
