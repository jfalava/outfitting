import { Console, Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { loadConfig } from "@/config";
import { foreignPackageManagerStub } from "@/commands/update/stubs";
import { pushLockfile } from "@/lockfiles";
import { tryPromise } from "@/lockfiles/effect";
import { foreignPackageManagers, type HostPlatform, type PackageManager } from "@/platform";
import { updateBun } from "@/update/bun";
import { updateScoop } from "@/update/scoop";
import { updateWindowsAll } from "@/update/windows-all";
import { updateWinget } from "@/update/winget";
import {
  recordWindowsOperation,
  WINDOWS_LOCK_KIND,
  windowsLockPath,
} from "@/update/windows-lock";

const noSyncFlag = Flag.boolean("no-sync").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip updating and pushing the Windows lock after a successful update."),
);

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

const bunCommand = Command.make("bun", { noSync: noSyncFlag }, ({ noSync }) =>
  Effect.gen(function* () {
    yield* updateBun();
    if (noSync) {
      yield* Console.log("Skipped Bun lock sync (--no-sync).");
    } else {
      const config = yield* tryPromise(() => loadConfig());
      yield* tryPromise(() =>
        recordWindowsOperation({
          config,
          manager: "bun",
          action: "upgrade",
          name: "*",
          args: ["update", "*"],
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
  }),
).pipe(Command.withDescription("Update Bun global packages (fails if bun is missing)."));

const scoopCommand = Command.make("scoop", { noSync: noSyncFlag }, ({ noSync }) =>
  updateScoop({ noSync }),
).pipe(
  Command.withDescription("Reconcile Scoop with the managed packages/windows/scoop.txt state."),
);

const wingetCommand = Command.make("winget", { noSync: noSyncFlag }, ({ noSync }) =>
  updateWinget({ noSync }),
).pipe(Command.withDescription("Upgrade all installed WinGet packages."));

const allCommand = Command.make("all", { noSync: noSyncFlag }, ({ noSync }) =>
  updateWindowsAll({ noSync }),
).pipe(
  Command.withDescription(
    "Run winget → scoop → bun → Windows lock sync; continue on failure; exit ≠0 if any step failed.",
  ),
);

/** Windows update tree; Homebrew and Nix remain hint stubs only. */
export const makeWindowsUpdateCommand = () => {
  const host = "windows" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));

  return Command.make("update").pipe(
    Command.withDescription(
      "Update machine packages (winget, scoop, bun, or all). One verb = full package path for that manager.",
    ),
    Command.withSubcommands([wingetCommand, scoopCommand, bunCommand, allCommand, ...foreign]),
  );
};
