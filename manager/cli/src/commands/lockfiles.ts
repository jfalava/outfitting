import { Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  configureToken,
  configureWorker,
  historyLockfiles,
  listLockfiles,
  pullLockfile,
  pushLockfile,
} from "../lockfiles";

const machine = Argument.string("machine").pipe(
  Argument.withDescription("Machine identifier, conventionally username:platform."),
);

const kind = Argument.string("kind").pipe(
  Argument.withDescription("Free-form lockfile kind, such as nix, bun, or winget."),
);

const configureWorkerCommand = Command.make(
  "configure-worker",
  {
    url: Argument.string("url").pipe(
      Argument.optional,
      Argument.withDescription("HTTP(S) URL of the deployed lockfiles Worker."),
    ),
  },
  ({ url }) => configureWorker(Option.getOrUndefined(url)),
).pipe(Command.withDescription("Store the lockfiles Worker URL in the OS keychain."));

const configureTokenCommand = Command.make("configure-token", {}, () => configureToken).pipe(
  Command.withDescription("Prompt for and store the Worker API token in the OS keychain."),
);

const pushCommand = Command.make(
  "push",
  {
    machine,
    kind,
    path: Argument.file("path", { mustExist: true }).pipe(
      Argument.withDescription("File to upload."),
    ),
    ifMatch: Flag.string("if-match").pipe(
      Flag.optional,
      Flag.withDescription("Only promote when the current hash matches this SHA-256."),
    ),
  },
  ({ machine: machineName, kind: lockfileKind, path, ifMatch }) =>
    pushLockfile({
      machine: machineName,
      kind: lockfileKind,
      path,
      ifMatch: Option.getOrUndefined(ifMatch),
    }),
).pipe(Command.withDescription("Upload and promote a lockfile snapshot."));

const pullCommand = Command.make(
  "pull",
  {
    machine,
    kind,
    outPath: Argument.string("out-path").pipe(
      Argument.optional,
      Argument.withDescription("Destination path; inferred for known kinds when omitted."),
    ),
  },
  ({ machine: machineName, kind: lockfileKind, outPath }) =>
    pullLockfile({
      machine: machineName,
      kind: lockfileKind,
      outPath: Option.getOrUndefined(outPath),
    }),
).pipe(Command.withDescription("Download the current lockfile snapshot."));

const listCommand = Command.make("list", { machine }, ({ machine: machineName }) =>
  listLockfiles(machineName),
).pipe(Command.withDescription("List the lockfile kinds tracked for a machine."));

const historyCommand = Command.make(
  "history",
  { machine, kind },
  ({ machine: machineName, kind: lockfileKind }) => historyLockfiles(machineName, lockfileKind),
).pipe(Command.withDescription("Show version history for a machine and kind."));

export const lockfilesCommand = Command.make("lockfiles").pipe(
  Command.withDescription(
    "Push, pull, and inspect lockfile snapshots stored by the lockfiles Worker.",
  ),
  Command.withSubcommands([
    configureWorkerCommand,
    configureTokenCommand,
    pushCommand,
    pullCommand,
    listCommand,
    historyCommand,
  ]),
);

export const runLockfilesCli = (args: ReadonlyArray<string>) =>
  Command.runWith(lockfilesCommand, { version: "0.1.0" })(args);
