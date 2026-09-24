import { Command, Flag } from "effect/unstable/cli";

import {
  linuxOfflineFlag,
  linuxOptionalProfileFlag,
  linuxPackageManagerFlag,
  optionalString,
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
import { updateLinuxAll } from "@/update/linux-all";
import { updateNix } from "@/update/nix";

const noPushFlag = Flag.Boolean("no-push").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip publishing the Nix lock after a successful action."),
);

const noRefreshFlag = Flag.Boolean("no-refresh").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the local source without fetching remote changes."),
);

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

function makeLinuxManagerCommand(manager: LinuxPackageManager) {
  return Command.make(manager, { offline: linuxOfflineFlag }, (commandFlags) =>
    updateLinux({ packageManager: manager, offline: commandFlags.offline }),
  ).pipe(Command.withDescription(`Update Linux packages with ${manager}.`));
}

const nixActionDescription = {
  build: "Build the Home Manager activation package without activating.",
  switch: "Build and activate the selected BYOR Home Manager profile.",
  test: "Test-build the Home Manager activation package without activating.",
  dry: "Dry-run the Home Manager build without activating.",
} as const satisfies Record<NixAction, string>;

const makeNixCommand = () => {
  const actions = NIX_ACTIONS.map((action) =>
    Command.make(
      action,
      { noPush: noPushFlag, noRefresh: noRefreshFlag },
      ({ noPush, noRefresh }) => updateNix({ action, noPush, noRefresh }),
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

const allCommand = Command.make(
  "all",
  {
    profile: linuxOptionalProfileFlag,
    packageManager: linuxPackageManagerFlag,
    offline: linuxOfflineFlag,
    noPush: noPushFlag,
    noRefresh: noRefreshFlag,
  },
  ({ profile, packageManager, offline, noPush, noRefresh }) =>
    updateLinuxAll({
      profile: optionalString(profile),
      packageManager: requestedLinuxPackageManager(packageManager),
      offline,
      noPush,
      noRefresh,
    }),
).pipe(
  Command.withDescription(
    "Update Home Manager when configured, then native packages; continue on failure.",
  ),
);

/** Distro-agnostic Linux update tree. */
export const makeLinuxUpdateCommand = () => {
  const host = "linux" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));
  return Command.make("update").pipe(
    Command.withDescription(
      "Update Home Manager when configured, then native apt or pacman packages.",
    ),
    Command.withSubcommands([
      allCommand,
      makeLinuxManagerCommand("apt"),
      makeLinuxManagerCommand("pacman"),
      makeNixCommand(),
      ...foreign,
    ]),
  );
};
