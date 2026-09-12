import { describe, expect, test } from "vitest";

import { fetchNpmLatestVersion, parseBunGlobalList } from "@/update/bun";

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

describe("fetchNpmLatestVersion", () => {
  test("reads dist-tags.latest", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ "dist-tags": { latest: "9.9.9" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await expect(fetchNpmLatestVersion("alchemy", fetcher)).resolves.toBe("9.9.9");
  });

  test("returns undefined on HTTP error", async () => {
    const fetcher = async () => new Response("nope", { status: 404 });
    await expect(fetchNpmLatestVersion("missing", fetcher)).resolves.toBeUndefined();
  });
});
