import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runSetup } from "@/setup/run";

/**
 * Materialize the outfitting state root (layout + optional config).
 * Manifest fetch/cache is available via the fetch module; fuller hooks land later.
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
  },
  ({ machineId, manifestBaseUrl, manifestRef }) =>
    runSetup({
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
    }),
).pipe(
  Command.withDescription(
    "Materialize the outfitting state root (manifests cache, config) without cloning the monorepo.",
  ),
);
