import { realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { remoteByorPlatform } from "@/fetch/github";
import { tryPromise } from "@/lockfiles/effect";
import { runMacosSetup } from "@/setup/macos";
import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { byorContractPlatforms, tryReadByorContract } from "@/source/contract";

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
          byor = true;
          resolvedRepo = root;
        }
      }

      const baseUrl = Option.getOrUndefined(manifestBaseUrl);
      const remoteByor = byor ? undefined : remoteByorPlatform("macos", baseUrl, repoPath);
      yield* runMacosSetup({
        machineId: Option.getOrUndefined(machineId),
        manifestBaseUrl: baseUrl,
        manifestRef: Option.getOrUndefined(manifestRef),
        repo: resolvedRepo,
        profile: profileName,
        repoProfile: profileName,
        remoteByor: remoteByor ? "macos" : undefined,
        fetchManifests: byor ? false : !noFetch && repoPath === undefined,
        sourcePaths: byor || remoteByor ? undefined : MACOS_SOURCE_PATHS,
        nextCommand: "Applying macOS repository configuration…",
      });
    });
  },
).pipe(
  Command.withDescription("Prepare and apply the declared macOS Nix and Homebrew configuration."),
);
