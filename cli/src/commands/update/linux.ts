import { Command, Flag } from "effect/unstable/cli";

import {
  linuxOfflineFlag,
  linuxPackageManagerFlag,
  requestedLinuxPackageManager,
} from "@/commands/linux-flags";
import { foreignPackageManagerStub } from "@/commands/update/stubs";
import {
  foreignPackageManagers,
  NIX_ACTIONS,
  type HostPlatform,
  type NixAction,
  type PackageManager,
} from "@/platform";
import { type LinuxPackageManager } from "@/platform/linux";
import { updateLinux } from "@/update/linux";
import { updateNix } from "@/update/nix";

const noPushFlag = Flag.Boolean("no-push").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip publishing the Nix lock after a successful action."),
);

function runLinuxUpdate(
  flags: {
    packageManager: import("effect").Option.Option<string>;
    offline: boolean;
  },
  manager?: LinuxPackageManager,
) {
  return updateLinux({
    packageManager: requestedLinuxPackageManager(flags.packageManager) ?? manager,
    offline: flags.offline,
  });
}

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

function makeLinuxManagerCommand(manager?: LinuxPackageManager) {
  if (manager === undefined) {
    return Command.make(
      "all",
      { packageManager: linuxPackageManagerFlag, offline: linuxOfflineFlag },
      (flags) => runLinuxUpdate(flags),
    ).pipe(Command.withDescription("Upgrade installed packages with detected apt or pacman."));
  }
  return Command.make(manager, { offline: linuxOfflineFlag }, (commandFlags) =>
    updateLinux({ packageManager: manager, offline: commandFlags.offline }),
  ).pipe(Command.withDescription(`Update Linux packages with ${manager}.`));
}

const nixActionDescription = {
  build: "Build the Home Manager activation package without activating.",
  switch: "Build and activate Home Manager (oci-agents / ubuntu-wsl).",
  test: "Test-build the Home Manager activation package without activating.",
  dry: "Dry-run the Home Manager build without activating.",
} as const satisfies Record<NixAction, string>;

const refreshFlag = Flag.Boolean("refresh").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Refresh the active Linux source before the Nix action."),
);

const makeNixCommand = () => {
  const actions = NIX_ACTIONS.map((action) =>
    Command.make(action, { noPush: noPushFlag, refresh: refreshFlag }, ({ noPush, refresh }) =>
      updateNix({ action, noPush, refresh }),
    ).pipe(Command.withDescription(nixActionDescription[action])),
  );

  // No default action: bare `update nix` only lists subcommands.
  return Command.make("nix").pipe(
    Command.withDescription(
      "Home Manager actions: build | switch | test | dry (pick one; bare nix lists them).",
    ),
    Command.withSubcommands(actions),
  );
};

/** Distro-agnostic Linux update tree; WSL remains owned by its shell workflow. */
export const makeLinuxUpdateCommand = () => {
  const host = "linux" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));
  return Command.make("update").pipe(
    Command.withDescription(
      "Update Linux packages with detected apt or pacman; use update nix for Home Manager.",
    ),
    Command.withSubcommands([
      makeLinuxManagerCommand(),
      makeLinuxManagerCommand("apt"),
      makeLinuxManagerCommand("pacman"),
      makeNixCommand(),
      ...foreign,
    ]),
  );
};
