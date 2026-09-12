/** On-disk + resolved manager configuration. */
export interface ManifestSourceConfig {
  /** GitHub raw (or mirror) base without trailing slash, no ref. */
  baseUrl: string;
  /** Git ref (branch, tag, or SHA). */
  ref: string;
}

export interface ManagerConfigFile {
  /** Optional override; when omitted, auto `user:arch-os` is used. */
  machineId?: string;
  manifest?: Partial<ManifestSourceConfig>;
}

export interface ManagerConfig {
  /** Absolute state root directory. */
  stateRoot: string;
  /** Effective machine id used for lock/inventory pushes. */
  machineId: string;
  /** Whether machineId came from config/env (true) or auto-detect (false). */
  machineIdOverridden: boolean;
  manifest: ManifestSourceConfig;
}

export const DEFAULT_MANIFEST_BASE_URL =
  "https://raw.githubusercontent.com/jfalava/outfitting";

export const DEFAULT_MANIFEST_REF = "main";
