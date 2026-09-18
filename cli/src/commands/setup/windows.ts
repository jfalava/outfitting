import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runSetup } from "@/setup/run";

/**
 * Materialize the Windows state root and cache the configured Scoop manifest.
 * Windows session environment remains owned by PowerShell.
 */
export const windowsInitCommand = Command.make(
  "init",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    manifestBaseUrl: Flag.String("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription("Raw-compatible repository base URL without ref."),
    ),
    manifestRef: Flag.String("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Git ref for manifests (default: main)."),
    ),
    noFetch: Flag.Boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Skip prefetching the configured Scoop manifest into the state root.",
      ),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, noFetch }) =>
    runSetup({
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      fetchManifests: !noFetch,
      useWindowsRoutes: true,
      nextCommand: "Next: outfitting-manager setup",
    }),
).pipe(
  Command.withDescription(
    "Initialize the Windows state root and cache configured repository manifests.",
  ),
);
