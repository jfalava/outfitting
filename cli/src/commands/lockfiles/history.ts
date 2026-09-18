import { Option } from "effect";
import { Command } from "effect/unstable/cli";

import { kindArgument } from "@/commands/lockfiles/arguments";
import { historyLockfiles } from "@/lockfiles";

export const historyCommand = Command.make("history", { kind: kindArgument }, ({ kind }) =>
  historyLockfiles({ kind: Option.getOrUndefined(kind) }),
).pipe(
  Command.withDescription(
    "Show version history for this machine. Omit kind (or pass all) for every tracked kind.",
  ),
);
