import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { syncSubcommands } from "@/commands/sync";
import { type LinuxPackageManager } from "@/platform/linux";
import { LINUX_PROFILES, syncLinux } from "@/update/linux";

const profileFlag = Flag.string("profile").pipe(
  Flag.optional,
  Flag.withDescription(`Linux profile (default: ${LINUX_PROFILES[0]}).`),
);

const offlineFlag = Flag.boolean("offline").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the cached Linux package manifest without a network request."),
);

function optional(value: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(value);
}

function makeLinuxSyncSubcommand(manager?: LinuxPackageManager) {
  return Command.make(
    manager ?? "all",
    { profile: profileFlag, offline: offlineFlag },
    (flags) =>
      syncLinux({
        profile: optional(flags.profile),
        packageManager: manager,
        offline: flags.offline,
      }),
  ).pipe(
    Command.withDescription(
      manager === undefined
        ? "Install missing declared Linux packages and preserve unrelated packages."
        : `Install missing declared ${manager} packages and preserve unrelated packages.`,
    ),
  );
}

/** Linux sync adds presence-based package reconciliation to shared lockfile transport. */
export const makeLinuxSyncCommand = () =>
  Command.make("sync").pipe(
    Command.withDescription(
      "Install missing declared Linux packages without removing unrelated packages; shared lockfile operations remain available as subcommands.",
    ),
    Command.withSubcommands([
      makeLinuxSyncSubcommand(),
      makeLinuxSyncSubcommand("apt"),
      makeLinuxSyncSubcommand("pacman"),
      ...syncSubcommands,
    ]),
  );
