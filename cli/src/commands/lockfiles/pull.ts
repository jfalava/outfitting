import { Option } from "effect";
import { Argument, Command } from "effect/unstable/cli";

import { kindArgument } from "@/commands/lockfiles/arguments";
import { pullLockfile } from "@/lockfiles";

export const pullCommand = Command.make(
  "pull",
  {
    kind: kindArgument,
    outPath: Argument.String("out-path").pipe(
      Argument.optional,
      Argument.withDescription(
        "Destination path; inferred for known kinds when omitted. Not valid with kind all.",
      ),
    ),
  },
  ({ kind, outPath }) =>
    pullLockfile({
      kind: Option.getOrUndefined(kind),
      outPath: Option.getOrUndefined(outPath),
    }),
).pipe(
  Command.withDescription(
    "Download lockfile snapshot(s) for this machine. Omit kind (or pass all) to pull every tracked kind.",
  ),
);
