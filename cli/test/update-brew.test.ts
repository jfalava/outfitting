import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import type { RunCommandResult } from "@/process";
import { parseBrewfileTaps, updateBrew } from "@/update/brew";
import { captureHomebrewInventory, HOMEBREW_INVENTORY_HEADER } from "@/update/snapshot";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

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

    const body = await Effect.runPromise(captureHomebrewInventory(run));
    expect(body.startsWith(HOMEBREW_INVENTORY_HEADER)).toBe(true);
    expect(body).toContain("[taps]\na/tap\nz/tap\n");
    expect(body).toContain("[formulae]\nbun 1.0\nzsh 5.9\n");
    expect(body).toContain("[casks]\nfirefox 120\n");
  });
});

test("setup applies the local Brewfile without upgrading or cleaning extras", async () => {
  const root = await mkdtemp(join(tmpdir(), "outfitting-brew-setup-"));
  temps.push(root);
  const brewfile = join(root, "Brewfile");
  await writeFile(brewfile, 'brew "jq"\n', "utf8");
  const recorded: Array<ReadonlyArray<string>> = [];

  const setupEffect = updateBrew({
    config: {
      stateRoot: root,
      machineId: "test:aarch64-darwin",
      machineIdOverridden: true,
      manifest: { baseUrl: "https://example.test/outfitting", ref: "main" },
    },
    brewfilePath: brewfile,
    noSync: true,
    upgrade: false,
    cleanup: false,
    which: async () => "/opt/homebrew/bin/brew",
    run: async (command, args) => {
      recorded.push([command, ...args]);
      return { code: 0, stdout: "", stderr: "" } satisfies RunCommandResult;
    },
  }) as unknown as Effect.Effect<void, unknown, never>;
  await Effect.runPromise(setupEffect);

  expect(recorded).toEqual([["brew", "bundle", `--file=${brewfile}`]]);
});
