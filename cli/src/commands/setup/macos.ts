import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runSetup } from "@/setup/run";

/**
 * Prepare and validate the macOS state root and repository source. This
 * command never activates Nix, changes Homebrew, or publishes inventory.
 */
export const macosInitCommand = Command.make(
  "init",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local source path override for this invocation."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("macOS profile declared in config.toml (defaults to its selection)."),
    ),
    noRefresh: Flag.Boolean("no-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Validate and use the published source without refreshing it."),
    ),
  },
  ({ machineId, repo, profile, noRefresh }) =>
    runSetup({
      platform: "macos",
      machineId: Option.getOrUndefined(machineId),
      repo: Option.getOrUndefined(repo),
      repoProfile: Option.getOrUndefined(profile),
      refreshSource: !noRefresh,
      skipSymlinks: true,
      nextCommand: "Next: outfit setup",
    }),
).pipe(
  Command.withDescription(
    "Prepare and validate the macOS source without applying Nix or Homebrew state.",
  ),
);
