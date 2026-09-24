import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runMacosSetup } from "@/setup/macos";

/**
 * Prepare and apply a repository's declared macOS configuration.
 */
export const setupCommand = Command.make(
  "setup",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local BYOR checkout; takes precedence over the remote BYOR map."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription(
        "BYOR macOS profile when outfitting.json defines more than one macOS profile.",
      ),
    ),
    noRefresh: Flag.Boolean("no-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Use the previously validated source without refreshing it."),
    ),
  },
  ({ machineId, repo, profile, noRefresh }) =>
    runMacosSetup({
      platform: "macos",
      machineId: Option.getOrUndefined(machineId),
      repo: Option.getOrUndefined(repo),
      profile: Option.getOrUndefined(profile),
      refreshSource: !noRefresh,
      nextCommand: "Applying macOS repository configuration…",
    }),
).pipe(
  Command.withDescription("Prepare and apply the declared macOS Nix and Homebrew configuration."),
);
