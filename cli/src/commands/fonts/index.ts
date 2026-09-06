import { Command } from "effect/unstable/cli";

import { configureCredentialsCommand, configureEndpointCommand } from "@/commands/fonts/configure";
import { listCommand } from "@/commands/fonts/list";
import { publishCommand } from "@/commands/fonts/publish";
import { removeCommand } from "@/commands/fonts/remove";
import { repopulateCommand } from "@/commands/fonts/repopulate";

export const fontsCommand = Command.make("fonts").pipe(
  Command.withDescription("Inventory, publish, and remove private fonts stored in R2."),
  Command.withSubcommands([
    configureEndpointCommand,
    configureCredentialsCommand,
    listCommand,
    repopulateCommand,
    publishCommand,
    removeCommand,
  ]),
);
