import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { tryPromise } from "@/lockfiles/effect";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { resolveSetupSource, runSetup } from "@/setup/run";

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
    manifestBaseUrl: Flag.String("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription("Override the raw-compatible repository base URL without the ref."),
    ),
    manifestRef: Flag.String("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Git ref for the sparse source (default: main)."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Existing local repository checkout to validate and use."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription(
        "BYOR macOS profile when outfitting.json defines more than one macOS profile.",
      ),
    ),
    noFetch: Flag.Boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip fetching; validate the source already in the state root."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, repo, profile, noFetch }) =>
    Effect.gen(function* () {
      const source = yield* tryPromise(() =>
        resolveSetupSource({
          platform: "macos",
          manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
          repo: Option.getOrUndefined(repo),
        }),
      );
      yield* runSetup({
        ...source,
        machineId: Option.getOrUndefined(machineId),
        manifestRef: Option.getOrUndefined(manifestRef),
        repoProfile: Option.getOrUndefined(profile),
        fetchManifests: !noFetch && source.repo === undefined,
        sourcePaths: MACOS_SOURCE_PATHS,
        skipSymlinks: true,
        validateSource: true,
        nextCommand: "Next: outfit setup",
      });
    }),
).pipe(
  Command.withDescription(
    "Prepare and validate the macOS source without applying Nix or Homebrew state.",
  ),
);
