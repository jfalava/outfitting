import { Console, Effect } from "effect";

import {
  configFilePath,
  ensureStateRoot,
  loadConfig,
  saveConfigFile,
  type ManagerConfigFile,
  type ManifestSourceConfig,
} from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

export interface SetupOptions {
  /** Optional machine id override written to config.json. */
  machineId?: string;
  /** Optional manifest base URL. */
  manifestBaseUrl?: string;
  /** Optional manifest ref (branch/tag/SHA). */
  manifestRef?: string;
  /** Override state root (tests / OUTFITTING_STATE_ROOT already handled in load). */
  stateRoot?: string;
}

function buildConfigPatch(options: SetupOptions): ManagerConfigFile | undefined {
  const patch: ManagerConfigFile = {};
  if (options.machineId !== undefined) {
    patch.machineId = options.machineId;
  }
  if (options.manifestBaseUrl !== undefined || options.manifestRef !== undefined) {
    const manifest: Partial<ManifestSourceConfig> = {};
    if (options.manifestBaseUrl !== undefined) {
      manifest.baseUrl = options.manifestBaseUrl;
    }
    if (options.manifestRef !== undefined) {
      manifest.ref = options.manifestRef;
    }
    patch.manifest = manifest;
  }
  if (patch.machineId === undefined && patch.manifest === undefined) {
    return undefined;
  }
  return patch;
}

/**
 * Materialize state root layout and optional config.json fields.
 * Does not clone the monorepo; later steps add more stubs/hooks.
 */
export const runSetup = (options: SetupOptions = {}) =>
  Effect.gen(function* () {
    const root = yield* tryPromise(() =>
      options.stateRoot === undefined ? ensureStateRoot() : ensureStateRoot(options.stateRoot),
    );

    const patch = buildConfigPatch(options);
    if (patch !== undefined) {
      yield* tryPromise(() => saveConfigFile(patch, { stateRoot: root }));
    }

    const config = yield* tryPromise(() => loadConfig({ stateRoot: root }));
    yield* Console.log(ui.success(`State root ready: ${config.stateRoot}`));
    yield* Console.log(ui.muted(`machine id: ${config.machineId}`));
    yield* Console.log(
      ui.muted(`manifests: ${config.manifest.baseUrl}/${config.manifest.ref}/…`),
    );
    yield* Console.log(ui.muted(`config: ${configFilePath(config.stateRoot)}`));
  });
