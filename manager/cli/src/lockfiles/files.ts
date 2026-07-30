import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { dirname, relative, resolve as resolvePath } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface GitExecutionError {
  code?: number | string;
  stderr?: string;
}

function isGitExecutionError(cause: unknown): cause is GitExecutionError {
  return cause instanceof Error;
}

function isOutsideGitRepository(cause: unknown): boolean {
  return (
    isGitExecutionError(cause) &&
    cause.code === 128 &&
    cause.stderr?.includes("not a git repository") === true
  );
}

function isUntrackedPath(cause: unknown): boolean {
  return isGitExecutionError(cause) && cause.code === 1;
}

const OUTPUT_PATHS: Readonly<Record<string, string>> = {
  brew: "Brewfile",
  brewfile: "Brewfile",
  bun: "bun.lock",
  "bun-global-inventory": "bun-global-inventory.json",
  flake: "flake.lock",
  homebrew: "Brewfile",
  "homebrew-inventory": "homebrew-inventory.txt",
  nix: "flake.lock",
  npm: "package-lock.json",
  "package-lock": "package-lock.json",
  "powershell-inventory": "powershell-inventory.json",
  "scoop-inventory": "scoop-inventory.json",
  winget: "winget.json",
};

export function inferOutputPath(kind: string): string | undefined {
  return OUTPUT_PATHS[kind.toLowerCase()];
}

export async function isGitTrackedFile(path: string): Promise<boolean> {
  const requestedPath = resolvePath(path);
  const absolutePath = await realpath(requestedPath).catch((cause: unknown) => {
    if (isGitExecutionError(cause) && cause.code === "ENOENT") {
      return requestedPath;
    }
    throw cause;
  });
  let root: string;

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", dirname(absolutePath), "rev-parse", "--show-toplevel"],
      { encoding: "utf8" },
    );
    root = await realpath(stdout.trim());
  } catch (cause) {
    if (isOutsideGitRepository(cause)) {
      return false;
    }
    throw cause;
  }

  if (!root) {
    throw new Error(`Git returned an empty repository root for: ${absolutePath}`);
  }

  const repositoryPath = relative(root, absolutePath);
  try {
    await execFileAsync("git", ["-C", root, "ls-files", "--error-unmatch", "--", repositoryPath]);
    return true;
  } catch (cause) {
    if (isUntrackedPath(cause)) {
      return false;
    }
    throw cause;
  }
}

export function normalizeSha256(value: string): string {
  const hash = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Expected a 64-character SHA-256 hash.");
  }
  return hash;
}
