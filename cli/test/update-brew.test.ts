import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

import { pushLockfile } from "@/lockfiles";
import type { RunCommandResult } from "@/process";
import { parseBrewfileTaps, setupBrew, updateBrew } from "@/update/brew";
import { captureHomebrewInventory } from "@/update/snapshot";

const temps: string[] = [];
vi.mock("@/lockfiles", () => ({ pushLockfile: vi.fn() }));

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
    expect(body.startsWith("outfitting-homebrew-inventory-v1\n")).toBe(true);
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

  const setupEffect = setupBrew({
    config: {
      stateRoot: root,
      machineId: "test:aarch64-darwin",
      machineIdOverridden: true,
    },
    brewfilePath: brewfile,
    which: async () => "/opt/homebrew/bin/brew",
    run: async (command, args) => {
      recorded.push([command, ...args]);
      return { code: 0, stdout: "", stderr: "" } satisfies RunCommandResult;
    },
  }) as unknown as Effect.Effect<void, unknown, never>;
  await Effect.runPromise(setupEffect);

  expect(recorded).toEqual([["brew", "bundle", "--no-upgrade", `--file=${brewfile}`]]);
});

test("update --no-push upgrades installed packages and still writes observed inventory", async () => {
  const root = await mkdtemp(join(tmpdir(), "outfitting-brew-update-"));
  temps.push(root);
  const calls: string[] = [];
  await Effect.runPromise(
    updateBrew({
      config: {
        stateRoot: root,
        machineId: "test:aarch64-darwin",
        machineIdOverridden: true,
      },
      noPush: true,
      which: async () => "brew",
      run: async (_command, args) => {
        calls.push(args.join(" "));
        return { code: 0, stderr: "", stdout: args[0] === "list" ? "manual-tool 2.0\n" : "" };
      },
    }),
  );
  expect(calls).toEqual([
    "update",
    "upgrade",
    "upgrade --cask",
    "tap",
    "list --formula --versions",
    "list --cask --versions",
  ]);
  expect(await readFile(join(root, "homebrew-inventory.txt"), "utf8")).toContain("manual-tool 2.0");
  expect(pushLockfile).not.toHaveBeenCalled();
});
