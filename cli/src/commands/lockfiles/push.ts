import { Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { kindArgument } from "@/commands/lockfiles/arguments";
import { pushLockfile } from "@/lockfiles";

export const pushCommand = Command.make(
  "push",
  {
    kind: kindArgument,
    path: Argument.File("path", { mustExist: true }).pipe(
      Argument.optional,
      Argument.withDescription(
        "File to upload; required for a single kind, omitted when kind is all.",
      ),
    ),
    ifMatch: Flag.String("if-match").pipe(
      Flag.optional,
      Flag.withDescription("Only promote when the current hash matches this SHA-256."),
    ),
  },
  ({ kind, path, ifMatch }) =>
    pushLockfile({
      kind: Option.getOrUndefined(kind),
      path: Option.getOrUndefined(path),
      ifMatch: Option.getOrUndefined(ifMatch),
    }),
).pipe(
  Command.withDescription(
    "Upload and promote lockfile snapshot(s) for this machine. Omit kind (or pass all) to push every known local lock path that exists.",
  ),
);
