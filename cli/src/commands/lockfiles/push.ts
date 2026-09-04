import { Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { kindArgument, machineArgument } from "@/commands/lockfiles/arguments";
import { pushLockfile } from "@/lockfiles";

export const pushCommand = Command.make(
  "push",
  {
    machine: machineArgument,
    kind: kindArgument,
    path: Argument.file("path", { mustExist: true }).pipe(
      Argument.withDescription("File to upload."),
    ),
    ifMatch: Flag.string("if-match").pipe(
      Flag.optional,
      Flag.withDescription(
        "Only promote when the current hash matches this SHA-256.",
      ),
    ),
  },
  ({ machine, kind, path, ifMatch }) =>
    pushLockfile({
      machine,
      kind,
      path,
      ifMatch: Option.getOrUndefined(ifMatch),
    }),
).pipe(Command.withDescription("Upload and promote a lockfile snapshot."));
