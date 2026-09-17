import { readFile } from "node:fs/promises";

import { which as defaultWhich } from "@/process";

export type LinuxPackageManager = "apt" | "pacman";
export type LinuxDistributionFamily = "debian" | "arch" | "unknown";
type OsReleaseValues = Readonly<Record<string, string>>;

const DEBIAN_IDENTIFIERS = new Set([
  "debian",
  "ubuntu",
  "linuxmint",
  "pop",
  "elementary",
  "kali",
  "raspbian",
]);

const ARCH_IDENTIFIERS = new Set(["arch", "archlinux", "manjaro", "endeavouros", "garuda"]);

export function parseOsRelease(content: string): Readonly<Record<string, string>> {
  const entries: Array<[string, string]> = [];
  for (const line of content.split(/\r?\n/)) {
    const match = /^(?<key>[A-Z0-9_]+)=(?<value>.*)$/.exec(line.trim());
    if (match?.groups?.key === undefined || match.groups.value === undefined) {
      continue;
    }
    const value = match.groups.value.trim();
    const unquoted =
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1).replaceAll('\\"', '"')
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1).replaceAll("\\'", "'")
          : value;
    entries.push([match.groups.key, unquoted]);
  }
  return Object.fromEntries(entries) satisfies OsReleaseValues;
}

export function linuxDistributionFamily(content: string): LinuxDistributionFamily {
  const values = parseOsRelease(content);
  const identifiers = [values["ID"], ...(values["ID_LIKE"]?.split(/\s+/) ?? [])]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  if (identifiers.some((value) => DEBIAN_IDENTIFIERS.has(value))) {
    return "debian";
  }
  if (identifiers.some((value) => ARCH_IDENTIFIERS.has(value))) {
    return "arch";
  }
  return "unknown";
}

function managerForFamily(family: LinuxDistributionFamily): LinuxPackageManager | undefined {
  switch (family) {
    case "debian":
      return "apt";
    case "arch":
      return "pacman";
    case "unknown":
      return undefined;
    default: {
      const exhaustive: never = family;
      return exhaustive;
    }
  }
}

export interface DetectLinuxPackageManagerOptions {
  requested?: LinuxPackageManager;
  osReleasePath?: string;
  readOsRelease?: (path: string) => Promise<string>;
  which?: typeof defaultWhich;
}

/** Detect a Linux package manager from distro metadata, then verify its executable. */
export async function detectLinuxPackageManager(
  options: DetectLinuxPackageManagerOptions = {},
): Promise<LinuxPackageManager> {
  const osReleasePath = options.osReleasePath ?? "/etc/os-release";
  const readOsRelease = options.readOsRelease ?? ((path: string) => readFile(path, "utf8"));
  const which = options.which ?? defaultWhich;
  const osRelease = await readOsRelease(osReleasePath).catch((cause) => {
    if (options.requested !== undefined) {
      return "";
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Unable to read ${osReleasePath}: ${message}`, { cause });
  });

  const family = linuxDistributionFamily(osRelease);
  const detected = managerForFamily(family);
  const requested = options.requested;
  const candidates =
    requested === undefined
      ? detected === undefined
        ? ["apt", "pacman"]
        : [detected]
      : [requested];
  const uniqueCandidates = [...new Set(candidates)].filter(
    (candidate): candidate is LinuxPackageManager => candidate !== undefined,
  );

  for (const manager of uniqueCandidates) {
    if ((await which(manager)) !== undefined) {
      return manager;
    }
  }

  if (requested !== undefined) {
    throw new Error(
      `Requested Linux package manager \`${requested}\` is not installed or not in PATH.`,
    );
  }

  const familyHint = family === "unknown" ? " detected from /etc/os-release" : ` for ${family}`;
  throw new Error(
    `No supported Linux package manager${familyHint} is installed. Install apt or pacman, or pass --package-manager apt|pacman.`,
  );
}
