import { Console, Data, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { runScoopCommand } from "@/update/scoop-command";
import { recordWindowsOperation, WINDOWS_LOCK_KIND, windowsLockPath } from "@/update/windows-lock";

export const SCOOP_MANIFEST_PATH = "packages/windows/scoop.txt";

class ScoopUpdateError extends Data.TaggedError("ScoopUpdateError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface ScoopBucket {
  name: string;
  url: string;
}

export interface ScoopManifest {
  buckets: ScoopBucket[];
  packages: string[];
}

function bucketNameFromUrl(value: string): string | undefined {
  const normalized = value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const last = segments.at(-1);
  if (last === undefined) {
    return undefined;
  }
  const name = last.replace(/^scoop-/i, "");
  return name.length > 0 ? name : undefined;
}

/** Parse the repository-owned Scoop desired-state manifest. */
export function parseScoopManifest(content: string): ScoopManifest {
  const buckets: ScoopBucket[] = [];
  const packages: string[] = [];
  const bucketNames = new Set<string>();
  const packageNames = new Set<string>();
  const invalid: string[] = [];

  content.split(/\r?\n/).forEach((raw, index) => {
    const entry = raw.trim();
    if (entry.length === 0 || entry.startsWith("#")) {
      return;
    }

    const bucket = /^bucket\s+"([^"\r\n]*\S[^"\r\n]*)"$/i.exec(entry);
    if (bucket?.[1] !== undefined) {
      const url = bucket[1].trim();
      const name = bucketNameFromUrl(url);
      if (name === undefined || bucketNames.has(name.toLowerCase())) {
        invalid.push(`line ${index + 1}: invalid or duplicate bucket '${url}'`);
        return;
      }
      bucketNames.add(name.toLowerCase());
      buckets.push({ name, url });
      return;
    }

    const packageMatch = /^package\s+"([^"\r\n]*\S[^"\r\n]*)"$/i.exec(entry);
    if (packageMatch?.[1] !== undefined) {
      const packageSpec = packageMatch[1].trim();
      const name = packageSpec.split("/").at(-1);
      if (name === undefined || packageNames.has(name.toLowerCase())) {
        invalid.push(`line ${index + 1}: invalid or duplicate package '${packageSpec}'`);
        return;
      }
      packageNames.add(name.toLowerCase());
      packages.push(packageSpec);
      return;
    }

    invalid.push(`line ${index + 1}: ${entry}`);
  });

  if (invalid.length > 0) {
    throw new Error(`Invalid Scoop manifest entries: ${invalid.join("; ")}`);
  }
  return { buckets, packages };
}

const requireScoopCommand = Effect.fn("requireScoopCommand")(function* (
  run: typeof runCommand,
  scoopPath: string,
  args: ReadonlyArray<string>,
  label: string,
) {
  const result = yield* tryPromise(() => runScoopCommand(run, scoopPath, args, { inherit: true }));
  if (result.code !== 0) {
    return yield* new ScoopUpdateError({
      message: `${label} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    });
  }
  return result;
});

const updateAndCleanScoop = Effect.fn("updateAndCleanScoop")(function* (
  run: typeof runCommand,
  scoopPath: string,
) {
  yield* requireScoopCommand(run, scoopPath, ["update"], "scoop update");
  yield* requireScoopCommand(run, scoopPath, ["update", "*"], "scoop update *");
  yield* requireScoopCommand(run, scoopPath, ["cleanup", "*"], "scoop cleanup *");
});

export interface UpdateScoopOptions {
  config?: ManagerConfig;
  noPush?: boolean;
  scoopPath?: string;
  run?: typeof runCommand;
  which?: typeof which;
}

/** Upgrade only packages already installed through Scoop. */
export const updateScoop = (options: UpdateScoopOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const scoopPath = options.scoopPath ?? (yield* tryPromise(() => whichFn("scoop")));
    if (scoopPath === undefined) {
      return yield* new ScoopUpdateError({ message: "Scoop is not installed or not in PATH." });
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    yield* Console.log(ui.heading("Updating installed Scoop packages…"));
    yield* updateAndCleanScoop(run, scoopPath);
    yield* tryPromise(() =>
      recordWindowsOperation({
        config,
        manager: "scoop",
        action: "upgrade",
        name: "*",
        args: ["update", "*"],
        status: "success",
        exitCode: 0,
      }),
    );
    if (options.noPush) {
      yield* Console.log(ui.muted("Updated local Windows state; skipped upload (--no-push)."));
    } else {
      yield* pushLockfile({
        machine: config.machineId,
        kind: WINDOWS_LOCK_KIND,
        path: windowsLockPath({ root: config.stateRoot }),
      });
    }
    yield* Console.log(ui.success("Installed Scoop packages updated."));
  });

export { captureScoopInventory, parseScoopExport } from "@/update/windows-snapshot";
