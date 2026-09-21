import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { validateOutfittingRepo } from "@/config/repo";
import {
  hasByorContract,
  parseByorContract,
  selectByorProfile,
  selectMacosByorProfile,
  selectWindowsByorProfiles,
  tryReadByorContract,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  windowsRoutesFromContract,
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

  test("accepts windows-only profiles with custom winget paths", async () => {
    const root = await repository();
    await mkdir(join(root, "packages", "custom"), { recursive: true });
    await writeFile(join(root, "packages", "custom", "base-winget.txt"), "Git.Git\n");
    await writeFile(join(root, "packages", "custom", "dev-winget.txt"), "OpenAI.Codex\n");
    await writeContract(root, {
      schema: 1,
      windows: {
        defaultProfiles: ["base", "dev"],
        scoop: { manifest: "packages/custom/scoop.txt" },
      },
      profiles: {
        base: { windows: { winget: { manifest: "packages/custom/base-winget.txt" } } },
        dev: { windows: { winget: { manifest: "packages/custom/dev-winget.txt" } } },
      },
    });
    await writeFile(join(root, "packages", "custom", "scoop.txt"), 'package "fzf"\n');

    await expect(validateWindowsByorSource({ root })).resolves.toMatchObject({
      names: ["base", "dev"],
      wingetPaths: {
        base: "packages/custom/base-winget.txt",
        dev: "packages/custom/dev-winget.txt",
      },
    });
  });

  test("selects composable multi-profile Windows sets", () => {
    const contract = parseByorContract({
      schema: 1,
      profiles: {
        base: { windows: { winget: { manifest: "base.txt" } } },
        dev: { windows: { winget: { manifest: "dev.txt" } } },
        gaming: { windows: { winget: { manifest: "gaming.txt" } } },
      },
    });
    expect(selectWindowsByorProfiles(contract, ["base,dev"])).toEqual({
      names: ["base", "dev"],
      wingetPaths: { base: "base.txt", dev: "dev.txt" },
      shared: undefined,
    });
    expect(() => selectWindowsByorProfiles(contract, ["missing"])).toThrow(
      /Unknown BYOR Windows profile `missing`/,
    );
  });

  test("rejects missing, empty, and invalid Windows winget manifests", async () => {
    const missing = await repository();
    await writeContract(missing, {
      schema: 1,
      profiles: {
        broken: { windows: { winget: { manifest: "missing.txt" } } },
      },
    });
    await expect(validateWindowsByorSource({ root: missing })).rejects.toThrow(/file is missing/);

    const empty = await repository();
    await writeFile(join(empty, "empty.txt"), "# nothing\n", "utf8");
    await writeContract(empty, {
      schema: 1,
      profiles: { empty: { windows: { winget: { manifest: "empty.txt" } } } },
    });
    await expect(validateWindowsByorSource({ root: empty })).rejects.toThrow(/empty winget manifest/);

    const invalid = await repository();
    await writeFile(join(invalid, "bad.txt"), "Git.Git --silent\n", "utf8");
    await writeContract(invalid, {
      schema: 1,
      profiles: { bad: { windows: { winget: { manifest: "bad.txt" } } } },
    });
    await expect(validateWindowsByorSource({ root: invalid })).rejects.toThrow(
      /invalid winget manifest/,
    );
  });

  test("rejects Windows path traversal in the contract", () => {
    expect(() =>
      parseByorContract({
        schema: 1,
        profiles: {
          unsafe: { windows: { winget: { manifest: "../escape.txt" } } },
        },
      }),
    ).toThrow(/repository-relative path without traversal/);
  });

  test("keeps Linux-only contracts working alongside mixed platform contracts", async () => {
    const root = await repository();
    await mkdir(join(root, "packages"), { recursive: true });
    await writeFile(join(root, "packages", "apt.txt"), "curl\n");
    await writeFile(join(root, "packages", "winget.txt"), "Git.Git\n");
    await writeContract(root, {
      schema: 1,
      profiles: {
        "debian-minimal": { linux: { apt: { manifest: "packages/apt.txt" } } },
        workstation: { windows: { winget: { manifest: "packages/winget.txt" } } },
      },
    });

    await expect(
      validateLinuxByorSource({ root, profile: "debian-minimal" }),
    ).resolves.toMatchObject({ profile: "debian-minimal", backends: ["apt"] });
    await expect(
      validateWindowsByorSource({ root, profiles: ["workstation"] }),
    ).resolves.toMatchObject({
      names: ["workstation"],
      wingetPaths: { workstation: "packages/winget.txt" },
    });
    // Selecting Windows must not require a Linux profile to exist on disk beyond the contract.
    await expect(validateWindowsByorSource({ root, profiles: ["workstation"] })).resolves.toBeDefined();
  });

  test("windowsRoutesFromContract prefers a common template or uses the BYOR sentinel", () => {
    const templated = parseByorContract({
      schema: 1,
      profiles: {
        base: { windows: { winget: { manifest: "packages/windows/base.txt" } } },
        dev: { windows: { winget: { manifest: "packages/windows/dev.txt" } } },
      },
    });
    expect(windowsRoutesFromContract(templated).wingetProfilePath).toBe(
      "packages/windows/{profile}.txt",
    );

    const custom = parseByorContract({
      schema: 1,
      profiles: {
        base: { windows: { winget: { manifest: "custom/base-winget.txt" } } },
        dev: { windows: { winget: { manifest: "elsewhere/dev.txt" } } },
      },
    });
    expect(windowsRoutesFromContract(custom).wingetProfilePath).toBe("byor/{profile}");
  });
});

  test("accepts macos-only profiles with custom flake and brewfile paths", async () => {
    const root = await repository();
    await mkdir(join(root, "system", "work"), { recursive: true });
    await writeFile(
      join(root, "system", "work", "flake.nix"),
      "{\n  outputs = { ... }: { darwinConfigurations = {}; };\n}\n",
    );
    await writeFile(join(root, "system", "work", "darwin.nix"), "{ ... }: {}\n");
    await mkdir(join(root, "packages", "work"), { recursive: true });
    await writeFile(join(root, "packages", "work", "Brewfile"), 'brew "git"\n');
    await mkdir(join(root, "fonts"), { recursive: true });
    await writeFile(join(root, "fonts", "fontget.txt"), "Inter\n");
    await writeFile(join(root, "system", "work", "home.nix"), "{ ... }: {}\n");
    await writeContract(root, {
      schema: 1,
      profiles: {
        workstation: {
          macos: {
            nix: {
              flake: "system/work",
              attribute: "darwinConfigurations.workstation.system",
            },
            brewfile: "packages/work/Brewfile",
            fonts: { manifest: "fonts/fontget.txt" },
            paths: ["system/work/home.nix"],
          },
        },
      },
    });

    await expect(validateMacosByorSource({ root })).resolves.toMatchObject({
      profile: "workstation",
      systemAttr: "darwinConfigurations.workstation.system",
      macos: {
        brewfile: "packages/work/Brewfile",
        nix: { flake: "system/work" },
      },
    });
  });

  test("rejects missing flake, missing darwinConfigurations, and path traversal for macos", async () => {
    const missingFlake = await repository();
    await writeContract(missingFlake, {
      schema: 1,
      profiles: {
        broken: {
          macos: {
            nix: { flake: "system/missing", attribute: "darwinConfigurations.x.system" },
          },
        },
      },
    });
    await expect(validateMacosByorSource({ root: missingFlake })).rejects.toThrow(
      /flake.nix is missing/,
    );

    const noDarwin = await repository();
    await mkdir(join(noDarwin, "system", "mac"), { recursive: true });
    await writeFile(join(noDarwin, "system", "mac", "flake.nix"), "{ outputs = {}; }\n");
    await writeFile(join(noDarwin, "system", "mac", "darwin.nix"), "{ ... }: {}\n");
    await writeContract(noDarwin, {
      schema: 1,
      profiles: {
        broken: {
          macos: {
            nix: { flake: "system/mac", attribute: "darwinConfigurations.x.system" },
          },
        },
      },
    });
    await expect(validateMacosByorSource({ root: noDarwin })).rejects.toThrow(
      /darwinConfigurations is required/,
    );

    expect(() =>
      parseByorContract({
        schema: 1,
        profiles: {
          unsafe: {
            macos: {
              nix: { flake: "../escape", attribute: "darwinConfigurations.x.system" },
            },
          },
        },
      }),
    ).toThrow(/repository-relative path without traversal/);
  });

  test("selects macos from mixed linux+macos contracts with an explicit profile", async () => {
    const root = await repository();
    await mkdir(join(root, "system", "mac"), { recursive: true });
    await writeFile(
      join(root, "system", "mac", "flake.nix"),
      "{ outputs = { ... }: { darwinConfigurations = {}; }; }\n",
    );
    await writeFile(join(root, "system", "mac", "darwin.nix"), "{ ... }: {}\n");
    await mkdir(join(root, "packages"), { recursive: true });
    await writeFile(join(root, "packages", "apt.txt"), "curl\n");
    await writeContract(root, {
      schema: 1,
      profiles: {
        desk: {
          macos: {
            nix: {
              flake: "system/mac",
              attribute: "darwinConfigurations.desk.system",
              darwin: "system/mac/darwin.nix",
            },
          },
        },
        "debian-minimal": { linux: { apt: { manifest: "packages/apt.txt" } } },
      },
    });

    await expect(validateMacosByorSource({ root, profile: "desk" })).resolves.toMatchObject({
      profile: "desk",
      systemAttr: "darwinConfigurations.desk.system",
    });
    await expect(
      validateLinuxByorSource({ root, profile: "debian-minimal" }),
    ).resolves.toMatchObject({ profile: "debian-minimal", backends: ["apt"] });

    const contract = parseByorContract({
      schema: 1,
      profiles: {
        desk: {
          macos: {
            nix: {
              flake: "system/mac",
              attribute: "darwinConfigurations.desk.system",
            },
          },
        },
        "debian-minimal": { linux: { apt: { manifest: "packages/apt.txt" } } },
      },
    });
    expect(selectMacosByorProfile(contract, "desk")).toMatchObject({ name: "desk" });
    expect(() => selectMacosByorProfile(contract, undefined)).not.toThrow();
  });

  test("validateOutfittingRepo returns flakeKind macos with custom systemAttr and darwin path", async () => {
    const root = await repository();
    await mkdir(join(root, "system", "custom"), { recursive: true });
    await writeFile(
      join(root, "system", "custom", "flake.nix"),
      "{ outputs = { ... }: { darwinConfigurations = {}; }; }\n",
    );
    await writeFile(join(root, "system", "custom", "darwin-host.nix"), "{ ... }: {}\n");
    await writeContract(root, {
      schema: 1,
      profiles: {
        laptop: {
          macos: {
            nix: {
              flake: "system/custom",
              attribute: "darwinConfigurations.laptop.system",
              darwin: "system/custom/darwin-host.nix",
            },
          },
        },
      },
    });

    await expect(validateOutfittingRepo(root)).resolves.toMatchObject({
      root,
      flakePath: join(root, "system", "custom"),
      darwinNixPath: join(root, "system", "custom", "darwin-host.nix"),
      flakeKind: "macos",
      systemAttr: "darwinConfigurations.laptop.system",
    });
  });

  test("windows-only and linux-only BYOR still resolve without macos", async () => {
    const windowsOnly = await repository();
    await writeFile(join(windowsOnly, "winget.txt"), "Git.Git\n");
    await writeContract(windowsOnly, {
      schema: 1,
      profiles: { base: { windows: { winget: { manifest: "winget.txt" } } } },
    });
    await expect(validateOutfittingRepo(windowsOnly)).resolves.toMatchObject({
      flakeKind: "none",
      systemAttr: "",
    });

    const linuxOnly = await repository();
    await mkdir(join(linuxOnly, "home"), { recursive: true });
    await writeFile(join(linuxOnly, "home", "flake.nix"), "{ outputs = {}; }\n");
    await writeContract(linuxOnly, {
      schema: 1,
      profiles: {
        server: {
          linux: {
            nix: {
              flake: "home",
              attribute: "homeConfigurations.server.activationPackage",
            },
          },
        },
      },
    });
    await expect(validateOutfittingRepo(linuxOnly)).resolves.toMatchObject({
      flakeKind: "home-manager",
      systemAttr: "homeConfigurations.server.activationPackage",
    });
  });
