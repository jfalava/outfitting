import { Command } from "effect/unstable/cli";

import { configWizardCommand } from "@/config/wizard";

export const configCommand = Command.make("config").pipe(
  Command.withDescription("Set up and manage the authoritative config.toml."),
  Command.withSubcommands([configWizardCommand]),
);
