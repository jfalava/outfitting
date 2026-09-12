import type { OutfittingRepo } from "@/config/repo";
import { runCommand, type RunCommandResult } from "@/process";
import { NIX_SYSTEM_ATTR } from "@/update/nix/types";

export type NixBuildMode = "build" | "test" | "dry";

export interface NixBuildOptions {
  repo: OutfittingRepo;
  /** Remote lock path when available. */
  lockPath?: string;
  mode: NixBuildMode;
  run?: typeof runCommand;
}

function flakeRef(flakePath: string): string {
  return `path:${flakePath}#${NIX_SYSTEM_ATTR}`;
}

function baseArgs(mode: NixBuildMode, lockPath: string | undefined): string[] {
  const args = ["build", "--impure", "--no-link"];
  if (mode === "build" || mode === "test") {
    args.push("--print-out-paths");
  }
  if (mode === "dry") {
    args.push("--dry-run");
  }
  if (lockPath !== undefined) {
    args.push("--reference-lock-file", lockPath, "--no-write-lock-file");
  }
  return args;
}

/**
 * Build (or dry-run) the nix-darwin system derivation.
 * Returns the store path when mode is build|test; empty for dry.
 */
export async function buildNixSystem(options: NixBuildOptions): Promise<string> {
  const run = options.run ?? runCommand;
  const args = [
    ...baseArgs(options.mode, options.lockPath),
    flakeRef(options.repo.flakePath),
  ];

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OUTFITTING_REPO: options.repo.root,
  };
  delete env.NIX_PATH;

  const result: RunCommandResult = await run("nix", args, {
    inherit: options.mode === "dry",
    env,
  });

  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `nix build failed (exit ${result.code})${detail ? `: ${detail}` : ""}`,
    );
  }

  if (options.mode === "dry") {
    return "";
  }

  const outPath = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);

  if (outPath === undefined) {
    throw new Error("nix build succeeded but printed no output path.");
  }
  return outPath;
}
