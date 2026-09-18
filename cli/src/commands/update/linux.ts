import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { foreignPackageManagerStub } from "@/commands/update/stubs";
import { foreignPackageManagers, type HostPlatform, type PackageManager } from "@/platform";
import { type LinuxPackageManager } from "@/platform/linux";
import { updateBun } from "@/update/bun";
import { LINUX_PROFILES, updateLinux } from "@/update/linux";

const profileFlag = Flag.String("profile").pipe(
  Flag.optional,
  Flag.withDescription(`Linux profile (default: ${LINUX_PROFILES[0]}).`),
);

const packageManagerFlag = Flag.String("package-manager").pipe(
  Flag.optional,
  Flag.withDescription("Override distro detection with apt or pacman."),
);

const offlineFlag = Flag.Boolean("offline").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the cached Linux package manifest without a network request."),
);

function optional(value: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(value);
}

function requestedPackageManager(value: string | undefined): LinuxPackageManager | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "apt" && value !== "pacman") {
    throw new Error(`Unknown Linux package manager \`${value}\`. Choose: apt or pacman.`);
  }
  return value;
}

function runLinuxUpdate(flags: {
  profile: Option.Option<string>;
  packageManager: Option.Option<string>;
  offline: boolean;
}, manager?: LinuxPackageManager) {
  return updateLinux({
    profile: optional(flags.profile),
    packageManager: requestedPackageManager(optional(flags.packageManager)) ?? manager,
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
      profile: profileFlag,
      packageManager: packageManagerFlag,
      offline: offlineFlag,
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
      profile: profileFlag,
      packageManager: packageManagerFlag,
      offline: offlineFlag,
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
