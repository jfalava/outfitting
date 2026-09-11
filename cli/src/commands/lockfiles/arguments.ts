import { Argument } from "effect/unstable/cli";

export const machineArgument = Argument.String("machine").pipe(
  Argument.withDescription("Machine identifier, conventionally username:platform."),
);

export const kindArgument = Argument.String("kind").pipe(
  Argument.withDescription("Free-form lockfile kind, such as nix, bun, or winget."),
);
