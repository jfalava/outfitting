import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runSetup } from "@/setup/run";

/**
 * Materialize the outfitting state root: config, repo-path, manifests, nix symlinks.
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
        "Monorepo path to store in ~/.config/outfitting/repo-path (replaces set_outfitting_repo).",
      ),
    ),
    noFetch: Flag.boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip prefetching Brewfile / bun.txt into the state root."),
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
      skipSymlinks,
    }),
).pipe(
  Command.withDescription(
    "Materialize the outfitting state root (config, repo-path, manifests, nix symlinks) without cloning the monorepo.",
  ),
);
