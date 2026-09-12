import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

/**
 * Materialize the outfitting state root (manifests, stubs, profile hooks).
 * Implementation lands in a later migration step; scaffold only for now.
 */
export const setupCommand = Command.make("setup", {}, () =>
  Effect.fail(
    new Error(
      "setup is not implemented yet (state root + manifest stubs come in a later step)",
    ),
  ),
).pipe(
  Command.withDescription(
    "Materialize the outfitting state root (manifests, stubs, hooks) without cloning the monorepo.",
  ),
);
