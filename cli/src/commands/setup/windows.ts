import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { WINDOWS_SETUP_MANIFEST_PATHS } from "@/setup/manifests";
import { runSetup } from "@/setup/run";

/**
 * Materialize the Windows state root and cache the Scoop + Bun manifests.
 * Windows session environment remains owned by PowerShell.
 */
export const windowsSetupCommand = Command.make(
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
    noFetch: Flag.boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip prefetching scoop.txt / bun.txt into the state root."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, noFetch }) =>
    runSetup({
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      fetchManifests: !noFetch,
      manifestPaths: WINDOWS_SETUP_MANIFEST_PATHS,
      nextCommand: "Next: outfitting-manager update winget|scoop|bun|all",
    }),
).pipe(
  Command.withDescription(
    "Materialize the Windows state root and cache scoop.txt / bun.txt without cloning the monorepo.",
  ),
);
