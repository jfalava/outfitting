import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { OutfittingRepo } from "@/config/repo";

async function ensureSymlink(linkPath: string, target: string): Promise<void> {
  try {
    const current = await readlink(linkPath);
    if (current === target) {
      return;
    }
  } catch (cause) {
    if (
      !(
        cause instanceof Error &&
        "code" in cause &&
        (cause as NodeJS.ErrnoException).code === "ENOENT"
      )
    ) {
      try {
        await lstat(linkPath);
      } catch {
        // fall through
      }
    }
  }

  await mkdir(dirname(linkPath), { recursive: true });
  await rm(linkPath, { force: true });
  await symlink(target, linkPath);
}

/** Ensure ~/.nixpkgs/darwin-configuration.nix and ~/.config/home-manager point at the repo. */
export async function ensureNixSymlinks(
  repo: OutfittingRepo,
  home = homedir(),
): Promise<void> {
  await mkdir(join(home, ".nixpkgs"), { recursive: true });
  await ensureSymlink(join(home, ".nixpkgs", "darwin-configuration.nix"), repo.darwinNixPath);
  await mkdir(join(home, ".config"), { recursive: true });
  await ensureSymlink(join(home, ".config", "home-manager"), repo.flakePath);
}
