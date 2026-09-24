import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { OutfittingRepo } from "@/config/repo";

async function ensureSymlink(linkPath: string, target: string): Promise<void> {
  let existing: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    existing = await lstat(linkPath);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) {
      throw cause;
    }
  }

  await mkdir(dirname(linkPath), { recursive: true });
  if (existing !== undefined) {
    if (!existing.isSymbolicLink()) {
      throw new Error(
        `Refusing to replace existing non-symlink at ${linkPath}. Move or remove it, then retry.`,
      );
    }
    if ((await readlink(linkPath)) === target) {
      return;
    }
    await rm(linkPath);
  }
  await symlink(target, linkPath);
}

/**
 * Ensure profile symlinks for the active flake.
 * macOS: ~/.nixpkgs/darwin-configuration.nix + ~/.config/home-manager → declared flake root
 * Home Manager: ~/.config/home-manager → declared flake root only
 */
export async function ensureNixSymlinks(repo: OutfittingRepo, home = homedir()): Promise<void> {
  if (repo.flakeKind === "none" || repo.flakePath.length === 0) {
    return;
  }

  await mkdir(join(home, ".config"), { recursive: true });
  await ensureSymlink(join(home, ".config", "home-manager"), repo.flakePath);

  if (repo.flakeKind === "macos" && repo.darwinNixPath.length > 0) {
    await mkdir(join(home, ".nixpkgs"), { recursive: true });
    await ensureSymlink(join(home, ".nixpkgs", "darwin-configuration.nix"), repo.darwinNixPath);
  }
}
