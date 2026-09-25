import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { configuredProfile, loadConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { resolveSetupSource, runSetup, type SetupOptions } from "@/setup/run";

export interface WindowsInitOptions extends SetupOptions {
  profiles?: string[];
}

export const initializeWindows = (options: WindowsInitOptions = {}) =>
  Effect.gen(function* () {
    const initialConfig = yield* tryPromise(() =>
      loadConfig({
        stateRoot: options.stateRoot,
        configPath: options.configPath,
        machineId: options.machineId,
      }),
    );
    const profiles = options.profiles ?? configuredProfile(initialConfig, "windows")?.split(",");
    const source = yield* tryPromise(() => resolveSetupSource({ ...options, platform: "windows" }));

    const validatedRepo = yield* runSetup({
      ...source,
      repoProfile: profiles?.join(","),
      refreshSource: options.refreshSource,
      nextCommand: options.nextCommand ?? "Next: outfitting-manager apply",
    });
    return { config: source.config!, repo: validatedRepo };
  });

/**
 * Initialize the Windows state root from the configured source.
 */
export const windowsInitCommand = Command.make(
  "init",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local source path override for this invocation."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated Windows profiles (defaults to config.toml)."),
    ),
    noRefresh: Flag.Boolean("no-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Validate and use the existing remote source cache without fetching."),
    ),
  },
  ({ machineId, noRefresh, profile, repo }) =>
    initializeWindows({
      profiles: Option.isSome(profile) ? profile.value.split(",") : undefined,
      machineId: Option.getOrUndefined(machineId),
      repo: Option.getOrUndefined(repo),
      refreshSource: !noRefresh,
      nextCommand: "Next: outfitting-manager apply",
    }),
).pipe(Command.withDescription("Initialize the Windows state root from the configured source."));
