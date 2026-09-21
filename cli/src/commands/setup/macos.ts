import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { tryPromise } from "@/lockfiles/effect";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { runSetup } from "@/setup/run";
import {
  byorContractPlatforms,
  tryReadByorContract,
  validateMacosByorSource,
} from "@/source/contract";

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
  ({ machineId, manifestBaseUrl, manifestRef, repo, profile, noFetch }) => {
    const repoPath = Option.getOrUndefined(repo);
    const profileName = Option.getOrUndefined(profile);

    return Effect.gen(function* () {
      let byor = false;
      let resolvedRepo = repoPath;
      if (repoPath !== undefined) {
        const absolute = isAbsolute(repoPath) ? repoPath : resolve(repoPath);
        const root = yield* tryPromise(() => realpath(absolute));
        const contract = yield* tryPromise(() => tryReadByorContract(root));
        if (contract !== undefined && byorContractPlatforms(contract).macos) {
          yield* tryPromise(() => validateMacosByorSource({ root, profile: profileName }));
          byor = true;
          resolvedRepo = root;
        }
      }

      yield* runSetup({
        machineId: Option.getOrUndefined(machineId),
        manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
        manifestRef: Option.getOrUndefined(manifestRef),
        repo: resolvedRepo,
        repoProfile: profileName,
        // Local BYOR checkout: skip sparse monorepo fetch and fixed-path validation list.
        fetchManifests: byor ? false : !noFetch && repoPath === undefined,
        sourcePaths: byor ? undefined : MACOS_SOURCE_PATHS,
        skipSymlinks: true,
        validateSource: true,
        nextCommand: "Next: outfit setup",
      });
    });
  },
).pipe(
  Command.withDescription(
    "Prepare and validate the macOS source without applying Nix or Homebrew state.",
  ),
);
