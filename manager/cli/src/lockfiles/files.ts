import { execFile } from "node:child_process";
import { dirname, relative, resolve as resolvePath } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OUTPUT_PATHS: Readonly<Record<string, string>> = {
  brew: "Brewfile",
  brewfile: "Brewfile",
  bun: "bun.lock",
  flake: "flake.lock",
  homebrew: "Brewfile",
  "homebrew-inventory": "homebrew-inventory.txt",
  nix: "flake.lock",
  npm: "package-lock.json",
  "package-lock": "package-lock.json",
  winget: "winget.json",
};

export function inferOutputPath(kind: string): string | undefined {
  return OUTPUT_PATHS[kind.toLowerCase()];
}

export async function isGitTrackedFile(path: string): Promise<boolean> {
  const absolutePath = resolvePath(path);

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", dirname(absolutePath), "rev-parse", "--show-toplevel"],
      { encoding: "utf8" },
    );
    const root = stdout.trim();
    if (!root) {
      return false;
    }

    const repositoryPath = relative(root, absolutePath);
    await execFileAsync("git", ["-C", root, "ls-files", "--error-unmatch", "--", repositoryPath]);
    return true;
  } catch {
    return false;
  }
}

export function normalizeSha256(value: string): string {
  const hash = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Expected a 64-character SHA-256 hash.");
  }
  return hash;
}
