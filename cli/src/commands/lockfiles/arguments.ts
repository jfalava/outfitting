import { Argument } from "effect/unstable/cli";

/**
 * Optional lockfile kind. When omitted (or `all`), list/history/pull/push
 * operate on every tracked or known kind for the resolved machine.
 * Machine id is never a CLI argument: OUTFITTING_MACHINE_ID → config.toml → auto.
 */
export const kindArgument = Argument.String("kind").pipe(
  Argument.optional,
  Argument.withDescription(
    "Lockfile kind such as nix, windows, or homebrew-inventory; omit or pass all for every kind.",
  ),
);
