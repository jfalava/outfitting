import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { OutfittingRepo } from "@/config/repo";
import { ensureNixSymlinks } from "@/update/nix/symlinks";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

async function fixture(
  kind: "macos" | "home-manager" = "macos",
): Promise<{ home: string; repo: OutfittingRepo }> {
  const root = await mkdtemp(join(tmpdir(), "outfitting-nix-links-"));
  temps.push(root);
  const home = join(root, "home");
  const repoRoot = join(root, "repo");
  if (kind === "home-manager") {
    const flakePath = join(repoRoot, "system", "oci-agents");
    await mkdir(flakePath, { recursive: true });
    await writeFile(join(flakePath, "flake.nix"), "{}\n");
    return {
      home,
      repo: {
        root: repoRoot,
        contract: { schema: 1, profiles: {} },
        flakePath,
        darwinNixPath: "",
        flakeKind: "home-manager",
        systemAttr: "homeConfigurations.oci-agents.activationPackage",
        homeManagerName: "oci-agents",
      },
    };
  }
  const flakePath = join(repoRoot, "system", "macos");
  const darwinNixPath = join(flakePath, "darwin.nix");
  await mkdir(flakePath, { recursive: true });
  await writeFile(darwinNixPath, "{}\n");
  return {
    home,
    repo: {
      root: repoRoot,
      contract: { schema: 1, profiles: {} },
      flakePath,
      darwinNixPath,
      flakeKind: "macos",
      systemAttr: "darwinConfigurations.macos.system",
    },
  };
}

describe("ensureNixSymlinks", () => {
  test("creates links, is idempotent, and replaces existing broken symlinks", async () => {
    const { home, repo } = await fixture();
    const darwinLink = join(home, ".nixpkgs", "darwin-configuration.nix");
    const homeManagerLink = join(home, ".config", "home-manager");

    await ensureNixSymlinks(repo, home);
    await ensureNixSymlinks(repo, home);
    expect(await readlink(darwinLink)).toBe(repo.darwinNixPath);
    expect(await readlink(homeManagerLink)).toBe(repo.flakePath);

    await rm(homeManagerLink);
    await symlink("/missing/old-target", homeManagerLink);
    await ensureNixSymlinks(repo, home);
    expect(await readlink(homeManagerLink)).toBe(repo.flakePath);
  });

  test("refuses and preserves a regular file", async () => {
    const { home, repo } = await fixture();
    const linkPath = join(home, ".nixpkgs", "darwin-configuration.nix");
    await mkdir(join(home, ".nixpkgs"), { recursive: true });
    await writeFile(linkPath, "keep me\n");

    await expect(ensureNixSymlinks(repo, home)).rejects.toThrow(
      /Refusing to replace existing non-symlink.*Move or remove it/,
    );
    expect(await readFile(linkPath, "utf8")).toBe("keep me\n");
  });

  test("refuses and preserves a directory", async () => {
    const { home, repo } = await fixture();
    const linkPath = join(home, ".config", "home-manager");
    await mkdir(linkPath, { recursive: true });
    await writeFile(join(linkPath, "keep"), "safe\n");

    await expect(ensureNixSymlinks(repo, home)).rejects.toThrow(
      /Refusing to replace existing non-symlink.*Move or remove it/,
    );
    expect((await lstat(linkPath)).isDirectory()).toBe(true);
    expect(await readFile(join(linkPath, "keep"), "utf8")).toBe("safe\n");
  });

  test("Home Manager profile only links ~/.config/home-manager", async () => {
    const { home, repo } = await fixture("home-manager");
    await ensureNixSymlinks(repo, home);
    expect(await readlink(join(home, ".config", "home-manager"))).toBe(repo.flakePath);
    await expect(lstat(join(home, ".nixpkgs", "darwin-configuration.nix"))).rejects.toThrow();
  });
});
