import { deflateRawSync } from "node:zlib";

import { describe, expect, test } from "vitest";

import { normalizeCommandAlias } from "@/arguments";
import {
  assetNameFor,
  checksumFromFile,
  downloadBytes,
  executableNameFor,
  executablePath,
  extractZipBinary,
  isNewerVersion,
  latestCliRelease,
  parseCliVersion,
} from "@/upgrade";

function appendBytes(parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function makeZip(fileName: string, contents: string): Uint8Array {
  const name = new TextEncoder().encode(fileName);
  const uncompressed = new TextEncoder().encode(contents);
  const compressed = new Uint8Array(deflateRawSync(uncompressed));
  const local = new Uint8Array(30 + name.length + compressed.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, 8, true);
  localView.setUint32(18, compressed.length, true);
  localView.setUint32(22, uncompressed.length, true);
  localView.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(compressed, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(20, compressed.length, true);
  centralView.setUint32(24, uncompressed.length, true);
  centralView.setUint16(28, name.length, true);
  central.set(name, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);
  return appendBytes([local, central, end]);
}

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
    expect(assetNameFor("darwin", "arm64")).toBe("outfitting-manager-darwin-arm64.zip");
    expect(executableNameFor("darwin", "arm64")).toBe("outfitting-manager-darwin-arm64");
    expect(assetNameFor("win32", "x64")).toBe("outfitting-manager-windows-x64.exe.zip");
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

  test("extracts the expected executable from a deflated ZIP archive", () => {
    const archive = makeZip("outfitting-manager-darwin-arm64", "Mach-O test binary");

    expect(extractZipBinary(archive, "outfitting-manager-darwin-arm64")).toEqual(
      new TextEncoder().encode("Mach-O test binary"),
    );
    expect(() => extractZipBinary(archive, "unexpected-name")).toThrow("does not contain");
  });

  test("retries transient download failures", async () => {
    let attempts = 0;
    const fetcher = async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("The socket connection was closed unexpectedly.");
      }
      return new Response(new Uint8Array([1, 2, 3]));
    };

    await expect(
      downloadBytes("https://example.test/asset", "Release asset", fetcher),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(attempts).toBe(3);
  });

  test("selects a stable CLI release and its assets", async () => {
    const asset = "outfitting-manager-linux-x64.zip";
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
              {
                name: "outfitting-manager-linux-x64",
                browser_download_url: "https://example.test/legacy",
              },
              {
                name: "outfitting-manager-linux-x64.sha256",
                browser_download_url: "https://example.test/legacy-checksum",
              },
              { name: asset, browser_download_url: "https://example.test/archive" },
              {
                name: `${asset}.sha256`,
                browser_download_url: "https://example.test/archive-checksum",
              },
            ],
          },
        ]),
      );

    await expect(latestCliRelease(asset, fetcher)).resolves.toEqual({
      version: "0.3.0",
      assetUrl: "https://example.test/archive",
      checksumUrl: "https://example.test/archive-checksum",
      format: "zip",
      executableName: "outfitting-manager-linux-x64",
    });
  });

  test("falls back to legacy raw assets for older releases", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: false,
            tag_name: "cli-v0.3.4",
            assets: [
              {
                name: "outfitting-manager-linux-x64",
                browser_download_url: "https://example.test/binary",
              },
              {
                name: "outfitting-manager-linux-x64.sha256",
                browser_download_url: "https://example.test/checksum",
              },
            ],
          },
        ]),
      );

    await expect(
      latestCliRelease("outfitting-manager-linux-x64.zip", fetcher),
    ).resolves.toMatchObject({
      assetUrl: "https://example.test/binary",
      checksumUrl: "https://example.test/checksum",
      format: "binary",
      executableName: "outfitting-manager-linux-x64",
    });
  });
});
