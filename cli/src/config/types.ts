/** Platform profile selected for this machine. */
export interface LinuxConfig {
  profile: string;
}

export interface ManagerConfigFile {
  /** Optional override; when omitted, auto `user:arch-os` is used. */
  machineId?: string;
  linux?: Partial<LinuxConfig>;
}

export interface ManagerConfig {
  /** Absolute state root directory. */
  stateRoot: string;
  /** Effective machine id used for lock/inventory pushes. */
  machineId: string;
  /** Whether machineId came from config/env (true) or auto-detect (false). */
  machineIdOverridden: boolean;
  /** Persisted Linux profile; absent on non-Linux or unconfigured hosts. */
  linux?: LinuxConfig;
}
