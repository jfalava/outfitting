import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { MACOS_SOURCE_PATHS } from "@/setup/manifests";
import { runSetup } from "@/setup/run";
import { ensureNixSymlinks } from "@/update/nix/symlinks";

/**
 * Materialize the outfitting state root: config, sparse source, repo-path, and nix symlinks.
 */
export const setupCommand = Command.make(
  "setup",
  {
    machineId: Flag.string("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    manifestBaseUrl: Flag.string("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription(
        "GitHub raw base URL without ref (default: raw.githubusercontent.com/jfalava/outfitting).",
      ),
    ),
    manifestRef: Flag.string("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Git ref for manifests (default: main)."),
    ),
    repo: Flag.string("repo").pipe(
      Flag.optional,
      Flag.withDescription(
        "Existing monorepo path to store in ~/.config/outfitting/repo-path; omit for sparse macOS source.",
      ),
    ),
    noFetch: Flag.boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip fetching the sparse macOS source into the state root."),
    ),
    skipSymlinks: Flag.boolean("skip-symlinks").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Do not ensure nix-darwin / home-manager symlinks."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, repo, noFetch, skipSymlinks }) =>
    runSetup({
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      repo: Option.getOrUndefined(repo),
      fetchManifests: !noFetch,
      sourcePaths: MACOS_SOURCE_PATHS,
      skipSymlinks,
      ensureSymlinks: ensureNixSymlinks,
      nextCommand: "Next: outfit update nix|brew|bun|all",
    }),
).pipe(
  Command.withDescription(
    "Materialize the outfitting state root and sparse macOS source without cloning the monorepo.",
  ),
);
