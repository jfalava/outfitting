import { Option } from "effect";
import { Argument, Command } from "effect/unstable/cli";

import { configureCredentials, configureEndpoint } from "@/fonts/configure";

export const configureEndpointCommand = Command.make(
  "configure-endpoint",
  {
    endpoint: Argument.String("endpoint").pipe(
      Argument.optional,
      Argument.withDescription("R2 S3 HTTPS endpoint or 32-character Cloudflare account ID."),
    ),
  },
  ({ endpoint }) => configureEndpoint(Option.getOrUndefined(endpoint)),
).pipe(Command.withDescription("Store the R2 S3 endpoint in the OS keychain."));

export const configureCredentialsCommand = Command.make(
  "configure-credentials",
  {},
  () => configureCredentials,
).pipe(Command.withDescription("Prompt for and store R2 S3 access keys in the OS keychain."));
