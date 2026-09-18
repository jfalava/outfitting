import { Option } from "effect";
import { Command } from "effect/unstable/cli";

import {
  linuxOfflineFlag,
  linuxOptionalProfileFlag,
  linuxPackageManagerFlag,
  optionalString,
  requestedLinuxPackageManager,
} from "@/commands/linux-flags";
import { foreignPackageManagerStub } from "@/commands/update/stubs";
import { foreignPackageManagers, type HostPlatform, type PackageManager } from "@/platform";
import { type LinuxPackageManager } from "@/platform/linux";
import { updateBun } from "@/update/bun";
import { updateLinux } from "@/update/linux";

function runLinuxUpdate(
  flags: {
    profile: Option.Option<string>;
    packageManager: Option.Option<string>;
    offline: boolean;
  },
  manager?: LinuxPackageManager,
) {
  return updateLinux({
    profile: optionalString(flags.profile),
    packageManager: requestedLinuxPackageManager(flags.packageManager) ?? manager,
    offline: flags.offline,
  });
}

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

function makeLinuxManagerCommand(manager?: LinuxPackageManager) {
  return Command.make(
    manager ?? "all",
    {
      profile: linuxOptionalProfileFlag,
      packageManager: linuxPackageManagerFlag,
      offline: linuxOfflineFlag,
    },
    (flags) => runLinuxUpdate(flags, manager),
  ).pipe(
    Command.withDescription(
      manager === undefined
        ? "Detect apt or pacman from /etc/os-release and installed executables."
        : `Update Linux packages with ${manager}; use --package-manager to override the detected manager.`,
    ),
  );
}

const bunCommand = Command.make("bun", {}, () => updateBun).pipe(
  Command.withDescription("Deprecated; run `bun update -g` directly."),
);

/** Distro-agnostic Linux update tree; WSL remains owned by its shell workflow. */
export const makeLinuxUpdateCommand = () => {
  const host = "linux" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));
  return Command.make(
    "update",
    {
      profile: linuxOptionalProfileFlag,
      packageManager: linuxPackageManagerFlag,
      offline: linuxOfflineFlag,
    },
    (flags) => runLinuxUpdate(flags),
  ).pipe(
    Command.withDescription(
      "Update Linux packages with detected apt or pacman; use --package-manager to override detection.",
    ),
    Command.withSubcommands([
      makeLinuxManagerCommand(),
      makeLinuxManagerCommand("apt"),
      makeLinuxManagerCommand("pacman"),
      bunCommand,
      ...foreign,
    ]),
  );
};
