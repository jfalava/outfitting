export type DiffPlatform = "macos" | "windows";

export type DiffManager = "brew" | "nix" | "winget" | "scoop";

export type DiffStatus = "same" | "different" | "unavailable";

export interface DiffSection {
  manager: DiffManager;
  status: DiffStatus;
  missing: string[];
  extra: string[];
  changed: string[];
  message?: string;
  warnings?: string[];
}

export interface PlatformDiff {
  platform: DiffPlatform;
  source: string;
  sections: DiffSection[];
  differences: boolean;
  unavailable: boolean;
}

export function hasDifferences(result: PlatformDiff): boolean {
  return result.differences || result.unavailable;
}
