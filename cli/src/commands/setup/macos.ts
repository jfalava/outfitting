import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { runSetup } from "@/setup/run";

/**
 * Prepare and validate the macOS state root and repository source. This
 * command never activates Nix, changes Homebrew, or publishes inventory.
 */
export const macosInitCommand = Command.make(
  "init",
  {
    machineId: Flag.string("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    manifestBaseUrl: Flag.string("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription("Override the raw-compatible repository base URL without the ref."),
    ),
    manifestRef: Flag.string("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Git ref for the sparse source (default: main)."),
    ),
    repo: Flag.string("repo").pipe(
      Flag.optional,
      Flag.withDescription("Existing local repository checkout to validate and use."),
    ),
    noFetch: Flag.boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip fetching; validate the source already in the state root."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, repo, noFetch }) => {
    const repoPath = Option.getOrUndefined(repo);
    return runSetup({
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      repo: repoPath,
      fetchManifests: !noFetch && repoPath === undefined,
      sourcePaths: MACOS_SOURCE_PATHS,
      skipSymlinks: true,
      validateSource: true,
      nextCommand: "Next: outfit setup",
    });
  },
).pipe(
  Command.withDescription(
    "Prepare and validate the macOS source without applying Nix or Homebrew state.",
  ),
);
