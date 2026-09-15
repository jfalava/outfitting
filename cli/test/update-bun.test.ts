import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { parseBunGlobalList, updateBun } from "@/update/bun";

describe("parseBunGlobalList", () => {
  test("parses bun pm ls -g style output", () => {
    const output = [
      "/Users/test/.bun/install/global/node_modules",
      "├── alchemy@0.1.0",
      "├── @scope/pkg@2.3.4",
      "└── skills@1.0.0",
    ].join("\n");

    expect(parseBunGlobalList(output)).toEqual([
      { name: "alchemy", installedVersion: "0.1.0" },
      { name: "@scope/pkg", installedVersion: "2.3.4" },
      { name: "skills", installedVersion: "1.0.0" },
    ]);
  });

  test("skips malformed lines", () => {
    expect(parseBunGlobalList("header\nnot-a-package\n")).toEqual([]);
  });
});

describe("updateBun", () => {
  test("is deprecated in favor of Bun's native global update", async () => {
    await expect(Effect.runPromise(updateBun)).rejects.toThrow(
      "`update bun` is deprecated; run `bun update -g` instead.",
    );
  });
});
