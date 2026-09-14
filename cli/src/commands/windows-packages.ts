import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { loadConfig, type ManagerConfig } from "@/config";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";
import { runScoopCommand } from "@/update/scoop-command";
import {
  isWingetAlreadyInstalledExitCode,
  recordWindowsOperation,
  WINDOWS_LOCK_KIND,
  windowsLockPath,
  type WindowsPackageAction,
  type WindowsPackageManager,
} from "@/update/windows-lock";

const packageArguments = Argument.string("package").pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription("Package IDs or Scoop package names."),
);

const noSyncFlag = Flag.boolean("no-sync").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Only update the local windows.lock.json; do not push it to the Worker."),
);

function commandArgs(
  manager: WindowsPackageManager,
  action: WindowsPackageAction,
  name: string,
): string[] {
  if (manager === "winget") {
    return [
      action,
      "--id",
      name,
      "--exact",
      "--accept-source-agreements",
      "--accept-package-agreements",
    ];
  }
  return [action, name];
}

function runPackage(
  manager: WindowsPackageManager,
  action: WindowsPackageAction,
  name: string,
  config: ManagerConfig,
) {
  return Effect.gen(function* () {
    const whichFn = manager === "scoop" ? which("scoop") : which(manager);
    const executable = yield* tryPromise(() => whichFn);
    if (executable === undefined) {
      return yield* new CliFailure({
        message: `${manager} is not installed or not in PATH.`,
      });
    }

    const args = commandArgs(manager, action, name);
    const result = yield* tryPromise(() =>
      manager === "scoop"
        ? runScoopCommand(runCommand, executable, args, { inherit: true })
        : runCommand(executable, args, { inherit: true }),
    );
    const alreadyInstalled =
      manager === "winget" && action === "install" && isWingetAlreadyInstalledExitCode(result.code);
    const status = result.code === 0 || alreadyInstalled ? "success" : "failed";
    yield* tryPromise(() =>
      recordWindowsOperation({
        config,
        manager,
        action,
        name,
        args,
        status,
        exitCode: result.code,
      }),
    );

    if (status === "failed") {
      return yield* new CliFailure({
        message: `${manager} ${action} ${name} failed (exit ${result.code}).`,
      });
    }
    if (alreadyInstalled) {
      yield* Console.log(ui.muted(`WinGet package already installed and up to date: ${name}`));
    }
    return undefined;
  });
}

function makePackageCommand(manager: WindowsPackageManager, action: WindowsPackageAction) {
  return Command.make(
    action,
    { packages: packageArguments, noSync: noSyncFlag },
    ({ packages, noSync }) =>
      Effect.gen(function* () {
        const config = yield* tryPromise(() => loadConfig());
        for (const name of packages) {
          yield* runPackage(manager, action, name, config);
        }

        if (noSync) {
          yield* Console.log(ui.muted("Skipped Worker sync (--no-sync)."));
          return;
        }

        yield* pushLockfile({
          machine: config.machineId,
          kind: WINDOWS_LOCK_KIND,
          path: windowsLockPath({ root: config.stateRoot }),
        });
      }),
  ).pipe(
    Command.withDescription(
      `${action === "install" ? "Install" : "Remove"} tracked ${manager} packages and record the operation.`,
    ),
  );
}

export const windowsPackageCommands = [
  Command.make("winget").pipe(
    Command.withDescription(
      "Install or remove a package through WinGet and track it in windows.lock.json.",
    ),
    Command.withSubcommands([
      makePackageCommand("winget", "install"),
      makePackageCommand("winget", "uninstall"),
    ]),
  ),
  Command.make("scoop").pipe(
    Command.withDescription(
      "Install or remove a package through Scoop and track it in windows.lock.json.",
    ),
    Command.withSubcommands([
      makePackageCommand("scoop", "install"),
      makePackageCommand("scoop", "uninstall"),
    ]),
  ),
] as const;

export function windowsPackageCommandArgs(
  manager: WindowsPackageManager,
  action: WindowsPackageAction,
  name: string,
): string[] {
  return commandArgs(manager, action, name);
}
