import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { initializeWindows } from "@/commands/setup/windows";
import { applyWindows } from "@/commands/windows-apply";

/** Apply the selected Windows BYOR state after refreshing or validating its source. */
export const windowsSetupCommand = Command.make(
  "setup",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: configured or auto user:arch-os)."),
    ),
    noRefresh: Flag.Boolean("no-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Use the previously validated remote source without fetching updates."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated profiles from outfitting.json or byor.json."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local BYOR checkout; takes precedence over the remote BYOR map."),
    ),
    wingetOnly: Flag.Boolean("winget-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip Scoop while bootstrapping WinGet."),
    ),
  },
  ({ machineId, noRefresh, profile, repo, wingetOnly }) =>
    initializeWindows({
      profiles: Option.isSome(profile) ? profile.value.split(",") : undefined,
      machineId: Option.getOrUndefined(machineId),
      repo: Option.getOrUndefined(repo),
      refreshSource: !noRefresh,
      nextCommand: "Applying Windows desired state…",
    }).pipe(
      Effect.flatMap(() =>
        applyWindows({
          profiles: Option.isSome(profile) ? profile.value.split(",") : undefined,
          wingetOnly,
          yes: true,
        }),
      ),
    ),
).pipe(
  Command.withDescription(
    "Refresh or validate the selected BYOR source, then apply its declared Windows package profiles.",
  ),
);
