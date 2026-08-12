import { describe, expect, test } from "vitest";

import { normalizeCommandAlias } from "@/arguments";
import {
  assetNameFor,
  checksumFromFile,
  executablePath,
  isNewerVersion,
  latestCliRelease,
  parseCliVersion,
} from "@/upgrade";

describe("upgrade command helpers", () => {
  test("silently normalizes the misspelled command alias", () => {
    expect(normalizeCommandAlias(["ugprade"])).toEqual(["upgrade"]);
    expect(normalizeCommandAlias(["ugprade", "--help"])).toEqual(["upgrade", "--help"]);
    expect(normalizeCommandAlias(["upgrade"])).toEqual(["upgrade"]);
  });

  test("compares stable CLI versions", () => {
    expect(parseCliVersion("cli-v1.2.3")).toEqual([1, 2, 3]);
    expect(isNewerVersion("1.3.0", "1.2.9")).toBe(true);
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
    expect(isNewerVersion("1.2.2", "1.2.3")).toBe(false);
  });

  test("maps supported release assets", () => {
    expect(assetNameFor("darwin", "arm64")).toBe("outfitting-manager-darwin-arm64");
    expect(assetNameFor("win32", "x64")).toBe("outfitting-manager-windows-x64.exe");
    expect(() => assetNameFor("win32", "arm64")).toThrow("not supported");
  });

  test("only accepts the compiled executable as its replacement target", () => {
    expect(executablePath("/opt/outfitting-manager", "/opt/outfitting-manager")).toBe(
      "/opt/outfitting-manager",
    );
    expect(() => executablePath("/repo/index.ts", "/usr/bin/bun")).toThrow("compiled");
    expect(
      executablePath(
        "/$bunfs/root/outfitting-manager",
        "/Users/test/.local/bin/outfitting-manager",
      ),
    ).toBe("/Users/test/.local/bin/outfitting-manager");
  });

  test("parses release checksum files", () => {
    expect(checksumFromFile(`${"A".repeat(64)}  outfitting-manager-linux-x64\n`)).toBe(
      "a".repeat(64),
    );
    expect(() => checksumFromFile("not-a-checksum")).toThrow("invalid");
  });

  test("selects a stable CLI release and its assets", async () => {
    const asset = "outfitting-manager-linux-x64";
    const fetcher = async () =>
      new Response(
        JSON.stringify([
          { draft: false, prerelease: false, tag_name: "v99.0.0", assets: [] },
          { draft: false, prerelease: false, tag_name: "cli-v0.2.0", assets: [] },
          {
            draft: false,
            prerelease: false,
            tag_name: "cli-v0.3.0",
            assets: [
              { name: asset, browser_download_url: "https://example.test/binary" },
              { name: `${asset}.sha256`, browser_download_url: "https://example.test/checksum" },
            ],
          },
        ]),
      );

    await expect(latestCliRelease(asset, fetcher)).resolves.toEqual({
      version: "0.3.0",
      binaryUrl: "https://example.test/binary",
      checksumUrl: "https://example.test/checksum",
    });
  });
});
