import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { tryPromise } from "@/lockfiles/effect";
import { runMacosSetup } from "@/setup/macos";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { resolveSetupSource } from "@/setup/run";

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
    manifestBaseUrl: Flag.String("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription(
        "GitHub raw base URL without ref (default: raw.githubusercontent.com/jfalava/outfitting).",
      ),
    ),
    manifestRef: Flag.String("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Git ref for manifests (default: main)."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription(
        "Existing local repository checkout to validate and use; omit for sparse source.",
      ),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription(
        "BYOR macOS profile when outfitting.json defines more than one macOS profile.",
      ),
    ),
    noFetch: Flag.Boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip fetching; apply the source already in the state root."),
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
      yield* runMacosSetup({
        ...source,
        machineId: Option.getOrUndefined(machineId),
        manifestRef: Option.getOrUndefined(manifestRef),
        profile: Option.getOrUndefined(profile),
        fetchManifests: !noFetch && source.repo === undefined,
        sourcePaths: MACOS_SOURCE_PATHS,
        nextCommand: "Applying macOS repository configuration…",
      });
    }),
).pipe(
  Command.withDescription("Prepare and apply the declared macOS Nix and Homebrew configuration."),
);
