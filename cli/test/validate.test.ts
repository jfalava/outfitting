import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { validateOutfittingRepo } from "@/config/repo";
import {
  hasByorContract,
  parseByorContract,
  selectByorProfile,
  tryReadByorContract,
  validateLinuxByorSource,
} from "@/source/contract";

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

  test("rejects an invalid package manifest", async () => {
    const root = await repository();
    await writeContract(root, {
      schema: 1,
      profiles: {
        broken: {
          linux: {
            pacman: { manifest: "packages.txt" },
          },
        },
      },
    });
    await writeFile(join(root, "packages.txt"), "valid-package\ninvalid package\n", "utf8");

    await expect(validateLinuxByorSource({ root, profile: "broken" })).rejects.toThrow(
      /invalid pacman manifest/,
    );
  });

  test("rejects a missing Nix flake", async () => {
    const root = await repository();
    await writeContract(root, {
      schema: 1,
      profiles: {
        broken: {
          linux: {
            nix: { flake: "system", attribute: "homeConfigurations.broken" },
          },
        },
      },
    });

    await expect(validateLinuxByorSource({ root, profile: "broken" })).rejects.toThrow(
      /flake.nix is missing/,
    );
  });

  test("treats a missing contract as legacy and rejects an invalid contract file", async () => {
    const missing = await repository();
    await expect(tryReadByorContract(missing)).resolves.toBeUndefined();
    await expect(hasByorContract(missing)).resolves.toBe(false);

    const invalid = await repository();
    await writeFile(join(invalid, "outfitting.json"), "{ not-a-contract: true }\n", "utf8");
    await expect(tryReadByorContract(invalid)).rejects.toThrow(/not valid JSON/);
    await expect(hasByorContract(invalid)).rejects.toThrow(/not valid JSON/);
    await expect(validateOutfittingRepo(invalid)).rejects.toThrow(/not valid JSON/);

    const wrongSchema = await repository();
    await writeContract(wrongSchema, { schema: 99, profiles: {} });
    await expect(tryReadByorContract(wrongSchema)).rejects.toThrow(/outfitting\.json is invalid/);
    await expect(validateOutfittingRepo(wrongSchema)).rejects.toThrow(
      /outfitting\.json is invalid/,
    );
  });

  test("schema failures name the offending path", () => {
    expect(() =>
      parseByorContract({
        schema: 1,
        profiles: {
          broken: {
            linux: {
              // attribute must be a string; number fails at the Schema boundary.
              nix: { flake: "home", attribute: 1 },
            },
          },
        },
      } as never),
    ).toThrow(/outfitting\.json is invalid/);
  });

  test("rejects an empty package manifest", async () => {
    const root = await repository();
    await writeContract(root, {
      schema: 1,
      profiles: {
        empty: { linux: { apt: { manifest: "packages.txt" } } },
      },
    });
    await writeFile(join(root, "packages.txt"), "# nothing installed\n\n", "utf8");
    await expect(validateLinuxByorSource({ root, profile: "empty" })).rejects.toThrow(
      /empty apt manifest/,
    );
  });

  test("selectByorProfile is shared by validation and flake resolution", () => {
    const contract = parseByorContract({
      schema: 1,
      profiles: {
        one: { linux: { apt: { manifest: "one.txt" } } },
        two: { linux: { pacman: { manifest: "two.txt" } } },
      },
    });
    expect(() => selectByorProfile(contract, undefined)).toThrow("Pass --profile (one, two)");
    expect(selectByorProfile(contract, "two")).toEqual({
      name: "two",
      linux: { pacman: { manifest: "two.txt" } },
    });
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
