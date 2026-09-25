import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { loadConfig, resolveOutfittingRepo } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import type { HostPlatform } from "@/platform";

function currentPlatform(): HostPlatform {
  if (process.platform === "darwin") {
    return "macos";
  }
  return process.platform === "win32" ? "windows" : "linux";
}

const pathCommand = Command.make("path", {}, () =>
  tryPromise(async () => {
    const config = await loadConfig();
    return resolveOutfittingRepo({ config, platform: currentPlatform() });
  }).pipe(Effect.flatMap((repo) => Console.log(repo.root))),
).pipe(Command.withDescription("Print the validated active source root (one path, for scripts)."));

export const sourceCommand = Command.make("source").pipe(
  Command.withDescription("Inspect the configured source."),
  Command.withSubcommands([pathCommand]),
);
