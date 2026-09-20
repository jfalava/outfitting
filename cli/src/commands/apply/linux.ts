import { Effect } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { linuxOfflineFlag, linuxOptionalProfileFlag, optionalString } from "@/commands/linux-flags";
import { type LinuxPackageManager } from "@/platform/linux";
import { applyLinux } from "@/update/linux";

const pruneFlag = Flag.Boolean("prune").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Remove stale packages proven to have been installed for the active profile.",
  ),
);

const yesFlag = Flag.Boolean("yes").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply the displayed install/removal plan without prompting."),
);

function makeLinuxApplySubcommand(manager?: LinuxPackageManager) {
  return Command.make(
    manager ?? "all",
    {
      profile: linuxOptionalProfileFlag,
      prune: pruneFlag,
      offline: linuxOfflineFlag,
      yes: yesFlag,
    },
    (flags) =>
      applyLinux({
        profile: optionalString(flags.profile),
        packageManager: manager,
        prune: flags.prune,
        offline: flags.offline,
        yes: flags.yes,
        confirm: Prompt.Confirm({
          message: "Apply this plan?",
          initial: false,
        }).pipe(Effect.orDie),
      }),
  ).pipe(
    Command.withDescription(
      manager === undefined
        ? "Apply the local Linux profile with the detected package manager."
        : `Apply the local Linux profile with ${manager}.`,
    ),
  );
}

export const makeLinuxApplyCommand = () =>
  Command.make("apply").pipe(
    Command.withDescription(
      "Install missing locally declared Linux packages; prune only proven ownership.",
    ),
    Command.withSubcommands([
      makeLinuxApplySubcommand(),
      makeLinuxApplySubcommand("apt"),
      makeLinuxApplySubcommand("pacman"),
    ]),
  );
