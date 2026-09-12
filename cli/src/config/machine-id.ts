import { userInfo } from "node:os";

import { envValue } from "@/secrets";

/**
 * Nix-style system triple fragment used in machine ids today
 * (e.g. `jfalava:aarch64-darwin`).
 */
export function hostSystemTriple(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const os =
    platform === "darwin" ? "darwin" : platform === "win32" ? "windows" : platform === "linux" ? "linux" : platform;

  const cpu =
    arch === "arm64" || arch === "aarch64"
      ? "aarch64"
      : arch === "x64" || arch === "x86_64"
        ? "x86_64"
        : arch === "ia32" || arch === "x86"
          ? "i686"
          : arch;

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
