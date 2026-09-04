import { Option } from "effect";
import { Argument, Command } from "effect/unstable/cli";

import { kindArgument, machineArgument } from "@/commands/lockfiles/arguments";
import { pullLockfile } from "@/lockfiles";

export const pullCommand = Command.make(
  "pull",
  {
    machine: machineArgument,
    kind: kindArgument,
    outPath: Argument.string("out-path").pipe(
      Argument.optional,
      Argument.withDescription("Destination path; inferred for known kinds when omitted."),
    ),
  },
  ({ machine, kind, outPath }) =>
    pullLockfile({
      machine,
      kind,
      outPath: Option.getOrUndefined(outPath),
    }),
).pipe(Command.withDescription("Download the current lockfile snapshot."));
