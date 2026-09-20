import { Command, Flag } from "effect/unstable/cli";

import { foreignPackageManagerStub } from "@/commands/update/stubs";
import { foreignPackageManagers, type HostPlatform, type PackageManager } from "@/platform";
import { updateScoop } from "@/update/scoop";
import { updateWindowsAll } from "@/update/windows-all";
import { updateWinget } from "@/update/winget";

const noPushFlag = Flag.Boolean("no-push").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Write local update state without uploading windows.lock.json."),
);

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

const scoopCommand = Command.make("scoop", { noPush: noPushFlag }, ({ noPush }) =>
  updateScoop({ noPush }),
).pipe(Command.withDescription("Upgrade packages already installed through Scoop."));

const wingetCommand = Command.make("winget", { noPush: noPushFlag }, ({ noPush }) =>
  updateWinget({ noPush }),
).pipe(Command.withDescription("Upgrade all installed WinGet packages."));

const allCommand = Command.make("all", { noPush: noPushFlag }, ({ noPush }) =>
  updateWindowsAll({ noPush }),
).pipe(
  Command.withDescription(
    "Run winget → scoop → Windows lock sync; continue on failure; exit ≠0 if any step failed.",
  ),
);

/** Windows update tree; Homebrew and Nix remain hint stubs only. */
export const makeWindowsUpdateCommand = () => {
  const host = "windows" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));

  return Command.make("update").pipe(
    Command.withDescription(
      "Update machine packages (winget, scoop, or all); Bun updates use `bun update -g`.",
    ),
    Command.withSubcommands([wingetCommand, scoopCommand, allCommand, ...foreign]),
  );
};
