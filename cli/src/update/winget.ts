import { Console, Effect } from "effect";

import { loadConfig, type ManagerConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which, type RunCommandResult } from "@/process";
import { ui } from "@/ui";
import { pushWingetInventory } from "@/update/windows-snapshot";

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

/** Upgrade every installed WinGet package, then optionally store its export. */
export const updateWinget = (options: UpdateWingetOptions = {}) =>
  Effect.gen(function* () {
    const run = options.run ?? runCommand;
    const whichFn = options.which ?? which;
    const wingetPath = yield* tryPromise(() => whichFn("winget"));
    if (wingetPath === undefined) {
      return yield* Effect.fail(new Error("WinGet is not installed or not in PATH."));
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
      yield* Console.log(ui.muted("Skipped inventory sync (--no-sync)."));
    } else {
      yield* pushWingetInventory({ config, run });
    }
    yield* Console.log(ui.success("WinGet update complete."));
  });

export { exportWingetInventory, pushWingetInventory } from "@/update/windows-snapshot";
