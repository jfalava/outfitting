import type { ByorContract } from "@/source/contract";

/** Platform profile selected for this machine. */
export interface LinuxConfig {
  profile: string;
}

export interface MacosConfig {
  profile: string;
}

export interface WindowsConfig {
  profiles: string[];
}

export type ConfiguredSource =
  | { kind: "local"; path: string }
  | { kind: "remote"; repository: string; ref: string };

export interface ManagerConfigFile {
  schema?: 1;
  /** Optional override; when omitted, auto `user:arch-os` is used. */
  machineId?: string;
  source?: ConfiguredSource;
  linux?: Partial<LinuxConfig>;
  macos?: Partial<MacosConfig>;
  windows?: Partial<WindowsConfig>;
  declarations?: ByorContract;
}

export interface ManagerConfig {
  /** Absolute path to the authoritative TOML configuration. */
  configPath: string;
  /** Absolute state root directory. */
  stateRoot: string;
  /** Effective machine id used for lock/inventory pushes. */
  machineId: string;
  /** Whether machineId came from config/env (true) or auto-detect (false). */
  machineIdOverridden: boolean;
  /** Selected source, resolved against configPath when local. */
  source?: ConfiguredSource;
  /** Configured platform selections; flags/environment may override per invocation. */
  linux?: LinuxConfig;
  macos?: MacosConfig;
  windows?: WindowsConfig;
  /** Validated profile declarations, absent until configured. */
  declarations?: ByorContract;
}
