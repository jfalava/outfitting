import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { loadConfig, readRepoPathFile } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { resolveSetupSource, runSetup, type SetupOptions } from "@/setup/run";
import { validateWindowsByorSource } from "@/source/contract";
import { readWindowsLock, writeWindowsLock } from "@/update/windows-lock";

export interface WindowsSetupOptions extends SetupOptions {
  profiles?: string[];
}

export const initializeWindows = (options: WindowsSetupOptions = {}) =>
  Effect.gen(function* () {
    const source = yield* tryPromise(() => resolveSetupSource({ ...options, platform: "windows" }));
    const localProfiles =
      source.repo === undefined
        ? undefined
        : yield* tryPromise(() =>
            validateWindowsByorSource({ root: source.repo!, profiles: options.profiles }),
          );
    const profiles = localProfiles?.names ?? options.profiles;

    yield* runSetup({
      ...source,
      repoProfile: profiles?.join(","),
      refreshSource: options.refreshSource,
      nextCommand: options.nextCommand ?? "Next: outfitting-manager setup",
    });

    const updatedConfig = yield* tryPromise(() => loadConfig({ stateRoot: options.stateRoot }));
    const updatedLock = yield* tryPromise(() => readWindowsLock(updatedConfig));
    const selectedRoot = yield* tryPromise(() => readRepoPathFile(updatedConfig));
    const selected = yield* tryPromise(() =>
      selectedRoot === undefined
        ? Promise.reject(new Error("Windows BYOR source was not saved during initialization."))
        : validateWindowsByorSource({ root: selectedRoot, profiles }),
    );
    updatedLock.profiles = selected.names;
    yield* tryPromise(() => writeWindowsLock(updatedLock, { root: updatedConfig.stateRoot }));
  });

/**
 * Initialize the Windows state root from a local or remote BYOR source.
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
      Flag.withDescription("Local BYOR repository checkout or remote Git repository."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated BYOR profiles to prepare."),
    ),
    noRefresh: Flag.Boolean("no-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Use the existing remote BYOR checkout without fetching updates."),
    ),
  },
  ({ machineId, noRefresh, profile, repo }) =>
    initializeWindows({
      profiles: Option.isSome(profile) ? profile.value.split(",") : undefined,
      machineId: Option.getOrUndefined(machineId),
      repo: Option.getOrUndefined(repo),
      refreshSource: !noRefresh,
      nextCommand: "Next: outfitting-manager setup",
    }),
).pipe(
  Command.withDescription("Initialize the Windows state root from the configured BYOR source."),
);
