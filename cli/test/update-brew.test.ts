import { describe, expect, test } from "vitest";

import { parseBrewfileTaps } from "@/update/brew";
import { captureHomebrewInventory, HOMEBREW_INVENTORY_HEADER } from "@/update/snapshot";
import type { RunCommandResult } from "@/process";

describe("parseBrewfileTaps", () => {
  test("extracts tap names", () => {
    const brewfile = `
tap "hashicorp/tap", trusted: true
tap 'cloudflare/cloudflare'
cask "firefox"
`;
    expect(parseBrewfileTaps(brewfile)).toEqual(["hashicorp/tap", "cloudflare/cloudflare"]);
  });
});

describe("captureHomebrewInventory", () => {
  test("formats taps formulae casks with stable header", async () => {
    const run = async (command: string, args: ReadonlyArray<string>): Promise<RunCommandResult> => {
      expect(command).toBe("brew");
      const key = args.join(" ");
      if (key === "tap") {
        return { code: 0, stdout: "z/tap\na/tap\n", stderr: "" };
      }
      if (key === "list --formula --versions") {
        return { code: 0, stdout: "zsh 5.9\nbun 1.0\n", stderr: "" };
      }
      if (key === "list --cask --versions") {
        return { code: 0, stdout: "firefox 120\n", stderr: "" };
      }
      throw new Error(`unexpected brew args: ${key}`);
    };

    const body = await captureHomebrewInventory(run);
    expect(body.startsWith(HOMEBREW_INVENTORY_HEADER)).toBe(true);
    expect(body).toContain("[taps]\na/tap\nz/tap\n");
    expect(body).toContain("[formulae]\nbun 1.0\nzsh 5.9\n");
    expect(body).toContain("[casks]\nfirefox 120\n");
  });
});
