import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { migrateLegacyConfig } from "@/config/migrate";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

const migrateCommand = Command.make(
  "migrate",
  {
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Legacy local checkout containing root outfitting.json."),
    ),
  },
  ({ repo }) =>
    tryPromise(() => migrateLegacyConfig({ repo: Option.getOrUndefined(repo) })).pipe(
      Effect.flatMap(({ configPath, source }) =>
        Console.log(ui.success(`Migrated ${source} configuration to ${configPath}.`)),
      ),
    ),
).pipe(
  Command.withDescription(
    "Convert existing config.json, byor.json, repo-path, or a local outfitting.json to config.toml without deleting legacy files.",
  ),
);

export const configCommand = Command.make("config").pipe(
  Command.withDescription("Manage the authoritative config.toml."),
  Command.withSubcommands([migrateCommand]),
);
