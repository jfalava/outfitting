import { Option } from "effect";
import { Argument, Command } from "effect/unstable/cli";

import { configureToken, configureWorker } from "@/lockfiles";

export const configureWorkerCommand = Command.make(
  "configure-worker",
  {
    url: Argument.string("url").pipe(
      Argument.optional,
      Argument.withDescription("HTTP(S) URL of the deployed lockfiles Worker."),
    ),
  },
  ({ url }) => configureWorker(Option.getOrUndefined(url)),
).pipe(
  Command.withDescription("Store the lockfiles Worker URL in the OS keychain."),
);

export const configureTokenCommand = Command.make(
  "configure-token",
  {},
  () => configureToken,
).pipe(
  Command.withDescription(
    "Prompt for and store the Worker API token in the OS keychain.",
  ),
);
