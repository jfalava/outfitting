import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which, type RunCommandResult } from "@/process";
import { ui } from "@/ui";
import {
  recordWindowsOperation,
  WINDOWS_LOCK_KIND,
  windowsLockPath,
  type WindowsPackageAction,
} from "@/update/windows-lock";

export function wingetPackageArgs(
  action: WindowsPackageAction,
  name: string,
  source?: "msstore",
): string[] {
  return [
    action,
    "--id",
    name,
    "--exact",
    ...(source === "msstore" ? ["--source", "msstore"] : []),
    "--accept-source-agreements",
    ...(action === "uninstall" ? [] : ["--accept-package-agreements"]),
  ];
}

export interface UpdateWingetOptions {
  config?: ManagerConfig;
  noSync?: boolean;
  run?: typeof runCommand;
  which?: typeof which;
}

async function requireWingetCommand(
  run: typeof runCommand,
  args: ReadonlyArray<string>,
): Promise<RunCommandResult> {
  const result = await run("winget", args, { inherit: true });
  if (result.code !== 0) {
    throw new Error(
      `winget ${args.join(" ")} failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return result;
}

/** Upgrade every installed WinGet package and optionally record the operation. */
export const updateWinget = (options: UpdateWingetOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const wingetPath = yield* tryPromise(() => whichFn("winget"));
    if (wingetPath === undefined) {
      return yield* new CliFailure({ message: "WinGet is not installed or not in PATH." });
    }

    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    yield* Console.log(ui.heading("Updating WinGet packages…"));
    yield* tryPromise(() =>
      requireWingetCommand(run, [
        "upgrade",
        "--all",
        "--accept-source-agreements",
        "--accept-package-agreements",
      ]),
    );

    if (options.noSync) {
      yield* Console.log(ui.muted("Skipped Windows lock sync (--no-sync)."));
    } else {
      yield* tryPromise(() =>
        recordWindowsOperation({
          config,
          manager: "winget",
          action: "upgrade",
          name: "*",
          args: ["upgrade", "--all", "--accept-source-agreements", "--accept-package-agreements"],
          status: "success",
          exitCode: 0,
        }),
      );
      yield* pushLockfile({
        machine: config.machineId,
        kind: WINDOWS_LOCK_KIND,
        path: windowsLockPath({ root: config.stateRoot }),
      });
    }
    yield* Console.log(ui.success("WinGet update complete."));
  });

export { exportWingetInventory, pushWingetInventory } from "@/update/windows-snapshot";
