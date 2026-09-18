import { Command } from "effect/unstable/cli";

import {
  linuxOfflineFlag,
  linuxOptionalProfileFlag,
  optionalString,
} from "@/commands/linux-flags";
import { syncSubcommands } from "@/commands/sync";
import { type LinuxPackageManager } from "@/platform/linux";
import { syncLinux } from "@/update/linux";

function makeLinuxSyncSubcommand(manager?: LinuxPackageManager) {
  return Command.make(
    manager ?? "all",
    { profile: linuxOptionalProfileFlag, offline: linuxOfflineFlag },
    (flags) =>
      syncLinux({
        profile: optionalString(flags.profile),
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
