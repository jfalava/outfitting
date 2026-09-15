import { userInfo } from "node:os";

import { envValue } from "@/secrets";

const PLATFORM_NAMES = new Map([
  ["darwin", "darwin"],
  ["win32", "windows"],
  ["linux", "linux"],
]);

const CPU_NAMES = new Map([
  ["arm64", "aarch64"],
  ["aarch64", "aarch64"],
  ["x64", "x86_64"],
  ["x86_64", "x86_64"],
  ["ia32", "i686"],
  ["x86", "i686"],
]);

/**
 * Nix-style system triple fragment used in machine ids today
 * (e.g. `jfalava:aarch64-darwin`).
 */
export function hostSystemTriple(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  if (platform === "darwin" && arch !== "arm64" && arch !== "aarch64") {
    throw new Error("macOS requires Apple Silicon.");
  }

  const os = PLATFORM_NAMES.get(platform) ?? platform;
  const cpu = CPU_NAMES.get(arch) ?? arch;

  return `${cpu}-${os}`;
}

export function defaultUsername(): string {
  const fromEnv = envValue("USER") ?? envValue("USERNAME");
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return userInfo().username;
  } catch {
    return "user";
  }
}

/** Auto machine id: `user:arch-os` (e.g. `jfalava:aarch64-darwin`). */
export function autoMachineId(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  username = defaultUsername(),
): string {
  return `${username}:${hostSystemTriple(platform, arch)}`;
}
