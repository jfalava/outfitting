import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import {
  resolveWindowsProfiles,
  resolveWindowsSource,
  windowsWingetProfilePath,
  windowsPowerShellProfilePath,
  windowsScoopPath,
  type WindowsSourceResolution,
} from "@/commands/windows-apply";
import { loadConfig, writeRepoPath, type ManagerConfig } from "@/config";
import { fetchManifest, type ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { resolveSetupSource, runSetup, type SetupOptions } from "@/setup/run";
import {
  selectWindowsByorProfiles,
  tryReadByorContract,
  validateWindowsByorSource,
} from "@/source/contract";
import { readWindowsLock, writeWindowsLock } from "@/update/windows-lock";

async function prepareLocalByor(
  repoCandidate: string | undefined,
  profiles: string[] | undefined,
  stateRoot: string | undefined,
): Promise<string | undefined> {
  if (repoCandidate === undefined) {
    return undefined;
  }
  const contract = await tryReadByorContract(repoCandidate);
  if (contract === undefined) {
    return undefined;
  }
  const hasWindows = Object.values(contract.profiles).some((entry) => entry.windows !== undefined);
  if (!hasWindows) {
    return undefined;
  }
  const validated = await validateWindowsByorSource({ root: repoCandidate, profiles });
  await writeRepoPath(validated.root, { stateRoot });
  return validated.root;
}

async function materializePath(
  relative: string,
  options: { root: string; config: ManagerConfig; fetcher?: ManifestFetcher },
): Promise<void> {
  let text: string;
  try {
    text = await readFile(join(options.root, relative), "utf8");
  } catch {
    return;
  }
  await fetchManifest({
    path: relative,
    config: options.config,
    materialize: true,
    fetcher: options.fetcher ?? (async () => new Response(text)),
  });
}

interface PreparedWindowsInit {
  config: ManagerConfig;
  lock: Awaited<ReturnType<typeof readWindowsLock>>;
  profiles: string[];
  resolved: WindowsSourceResolution;
  source: WindowsSourceResolution;
}

async function prepareWindowsInit(
  options: SetupOptions & { profiles?: string[] },
): Promise<PreparedWindowsInit> {
  const config = await loadConfig({ stateRoot: options.stateRoot });
  const source = await resolveWindowsSource(config, options.profiles);
  const lock = await readWindowsLock(config);
  const profiles = await resolveWindowsProfiles(
    options.profiles,
    lock.profiles,
    source.routes.defaultProfiles,
  );
  const resolved =
    source.contract === undefined
      ? source
      : { ...source, byor: selectWindowsByorProfiles(source.contract, profiles) };
  return { config, lock, profiles, resolved, source };
}

async function materializeByorCheckout(options: {
  byorRoot: string;
  config: ManagerConfig;
  profiles: string[];
  source: WindowsSourceResolution;
  fetcher?: ManifestFetcher;
}): Promise<void> {
  if (options.source.contract === undefined) {
    return;
  }
  const byor = selectWindowsByorProfiles(options.source.contract, options.profiles);
  const resolved = { ...options.source, byor };
  for (const profile of options.profiles) {
    await materializePath(byor.wingetPaths[profile]!, {
      root: options.byorRoot,
      config: options.config,
    });
  }
  await materializePath(windowsScoopPath(options.config, resolved), {
    root: options.byorRoot,
    config: options.config,
  });
  await materializePath(windowsPowerShellProfilePath(options.config, resolved), {
    root: options.byorRoot,
    config: options.config,
  });
}

async function finishWindowsInit(
  options: SetupOptions & { profiles?: string[] },
  byorRoot: string | undefined,
  remoteByor: boolean,
): Promise<void> {
  const prepared = await prepareWindowsInit(options);
  const { config, lock, profiles, resolved, source } = prepared;
  if (options.fetchManifests !== false && byorRoot === undefined && !remoteByor) {
    for (const path of [
      ...profiles.map((profile) => windowsWingetProfilePath(config, profile, resolved)),
      windowsPowerShellProfilePath(config, resolved),
    ]) {
      await fetchManifest({ path, config, materialize: true, fetcher: options.fetcher });
    }
  } else if (byorRoot !== undefined && options.fetchManifests !== false) {
    await materializeByorCheckout({
      byorRoot,
      config,
      profiles,
      source,
      fetcher: options.fetcher,
    });
  }
  lock.profiles = profiles;
  await writeWindowsLock(lock, { root: config.stateRoot });
}

export const initializeWindows = (options: SetupOptions & { profiles?: string[] } = {}) =>
  Effect.gen(function* () {
    const source = yield* tryPromise(() => resolveSetupSource({ ...options, platform: "windows" }));
    let profiles = options.profiles;
    if (source.remoteByor !== undefined && profiles === undefined) {
      const config = yield* tryPromise(() => loadConfig({ stateRoot: options.stateRoot }));
      const lock = yield* tryPromise(() => readWindowsLock(config));
      if (lock.profiles.length > 0) {
        profiles = lock.profiles;
      }
    }
    const byorRoot = yield* tryPromise(() =>
      prepareLocalByor(source.repo, profiles, options.stateRoot),
    );

    yield* runSetup({
      ...source,
      repoProfile: profiles?.join(","),
      // Local BYOR checkout: skip network prefetch of monorepo routes.
      fetchManifests: byorRoot !== undefined ? false : options.fetchManifests,
      useWindowsRoutes: byorRoot === undefined && source.remoteByor === undefined,
      nextCommand: options.nextCommand ?? "Next: outfitting-manager setup",
    });

    yield* tryPromise(() =>
      finishWindowsInit({ ...options, profiles }, byorRoot, source.remoteByor !== undefined),
    );
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
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local BYOR repository checkout to validate and use."),
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
  ({ machineId, manifestBaseUrl, manifestRef, noFetch, profile, repo }) =>
    initializeWindows({
      profiles: Option.isSome(profile) ? [profile.value] : undefined,
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      repo: Option.getOrUndefined(repo),
      fetchManifests: !noFetch,
      useWindowsRoutes: true,
      nextCommand: "Next: outfitting-manager setup",
    }),
).pipe(
  Command.withDescription(
    "Initialize the Windows state root and cache configured repository manifests.",
  ),
);
