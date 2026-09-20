import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import {
  resolveWindowsProfiles,
  windowsWingetProfilePath,
  windowsPowerShellProfilePath,
} from "@/commands/windows-apply";
import { loadConfig, resolveWindowsRoutes } from "@/config";
import { fetchManifest } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { runSetup, type SetupOptions } from "@/setup/run";
import { readWindowsLock, writeWindowsLock } from "@/update/windows-lock";

export const initializeWindows = (options: SetupOptions & { profiles?: string[] } = {}) =>
  Effect.gen(function* () {
    yield* runSetup({
      ...options,
      useWindowsRoutes: true,
      nextCommand: "Next: outfitting-manager setup",
    });
    const config = yield* tryPromise(() => loadConfig({ stateRoot: options.stateRoot }));
    const lock = yield* tryPromise(() => readWindowsLock(config));
    const profiles = yield* tryPromise(async () =>
      resolveWindowsProfiles(
        options.profiles,
        lock.profiles,
        resolveWindowsRoutes(config.windows).defaultProfiles,
      ),
    );
    if (options.fetchManifests !== false) {
      for (const path of [
        ...profiles.map((profile) => windowsWingetProfilePath(config, profile)),
        windowsPowerShellProfilePath(config),
      ]) {
        yield* tryPromise(() =>
          fetchManifest({ path, config, materialize: true, fetcher: options.fetcher }),
        );
      }
    }
    lock.profiles = profiles;
    yield* tryPromise(() => writeWindowsLock(lock, { root: config.stateRoot }));
  });

/**
 * Materialize the Windows state root and cache the configured Scoop manifest.
 * Windows session environment remains owned by PowerShell.
 */
export const windowsInitCommand = Command.make(
  "init",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    manifestBaseUrl: Flag.String("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription("Raw-compatible repository base URL without ref."),
    ),
    manifestRef: Flag.String("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Git ref for manifests (default: main)."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated profiles to prepare."),
    ),
    noFetch: Flag.Boolean("no-fetch").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip fetching package manifests and the PowerShell profile."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, noFetch, profile }) =>
    initializeWindows({
      profiles: Option.isSome(profile) ? [profile.value] : undefined,
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      fetchManifests: !noFetch,
      useWindowsRoutes: true,
      nextCommand: "Next: outfitting-manager setup",
    }),
).pipe(
  Command.withDescription(
    "Initialize the Windows state root and cache configured repository manifests.",
  ),
);
