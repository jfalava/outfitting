import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { validateOutfittingRepo } from "@/config/repo";
import { parseByorContract, validateLinuxByorSource } from "@/source/contract";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "outfitting-byor-"));
  temporaryRoots.push(root);
  return root;
}

async function writeContract(root: string, value: unknown): Promise<void> {
  await writeFile(join(root, "outfitting.json"), `${JSON.stringify(value)}\n`, "utf8");
}

describe("BYOR contract", () => {
  test("accepts arbitrary Linux profiles with only Nix or native packages", async () => {
    const root = await repository();
    await mkdir(join(root, "system", "server"), { recursive: true });
    await writeFile(join(root, "system", "server", "flake.nix"), "{ outputs = {}; }\n");
    await mkdir(join(root, "packages", "debian"), { recursive: true });
    await writeFile(join(root, "packages", "debian", "minimal.txt"), "curl\ngit\n");
    await writeContract(root, {
      schema: 1,
      profiles: {
        "nix-server": {
          linux: {
            nix: {
              flake: "system/server",
              attribute: "homeConfigurations.server.activationPackage",
            },
          },
        },
        "debian-minimal": {
          linux: { apt: { manifest: "packages/debian/minimal.txt" } },
        },
      },
    });

    await expect(validateLinuxByorSource({ root, profile: "nix-server" })).resolves.toMatchObject({
      profile: "nix-server",
      backends: ["nix"],
    });
    await expect(
      validateLinuxByorSource({ root, profile: "debian-minimal" }),
    ).resolves.toMatchObject({
      profile: "debian-minimal",
      backends: ["apt"],
    });
  });

  test("requires an explicit profile when several are declared", async () => {
    const root = await repository();
    await writeContract(root, {
      schema: 1,
      profiles: {
        one: { linux: { apt: { manifest: "one.txt" } } },
        two: { linux: { pacman: { manifest: "two.txt" } } },
      },
    });

    await expect(validateLinuxByorSource({ root })).rejects.toThrow("Pass --profile (one, two)");
  });

  test("rejects unsafe paths before reading outside the repository", () => {
    expect(() =>
      parseByorContract({
        schema: 1,
        profiles: { unsafe: { linux: { apt: { manifest: "../packages.txt" } } } },
      }),
    ).toThrow(/repository-relative path without traversal/);
  });

  test("rejects a missing Nix flake and invalid package manifest", async () => {
    const root = await repository();
    await writeContract(root, {
      schema: 1,
      profiles: {
        broken: {
          linux: {
            pacman: { manifest: "packages.txt" },
            nix: { flake: "system", attribute: "homeConfigurations.broken" },
          },
        },
      },
    });
    await writeFile(join(root, "packages.txt"), "valid-package\ninvalid package\n", "utf8");

    await expect(validateLinuxByorSource({ root, profile: "broken" })).rejects.toThrow(
      /invalid pacman manifest/,
    );
  });

  test("resolves an arbitrary Nix output for setup and update commands", async () => {
    const root = await repository();
    await mkdir(join(root, "home"), { recursive: true });
    await writeFile(join(root, "home", "flake.nix"), "{ outputs = {}; }\n");
    await writeContract(root, {
      schema: 1,
      profiles: {
        workstation: {
          linux: {
            nix: {
              flake: "home",
              attribute: "homeConfigurations.workstation.activationPackage",
            },
          },
        },
      },
    });

    await expect(validateOutfittingRepo(root, { profile: "workstation" })).resolves.toMatchObject({
      root,
      flakePath: join(root, "home"),
      flakeKind: "home-manager",
      systemAttr: "homeConfigurations.workstation.activationPackage",
      homeManagerName: "workstation",
    });
  });
});
