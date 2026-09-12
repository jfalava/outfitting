import { describe, expect, test } from "vitest";

import {
  foreignPackageManagerMessage,
  foreignPackageManagers,
  MACOS_UPDATE_MANAGERS,
  NIX_ACTIONS,
  PACKAGE_MANAGER_PLATFORM,
  platformLabel,
} from "@/platform";

describe("package manager availability table", () => {
  test("macos natives and foreign hint set", () => {
    expect([...MACOS_UPDATE_MANAGERS]).toEqual(["bun", "brew", "nix", "all"]);
    expect(foreignPackageManagers("macos").sort()).toEqual(["scoop", "winget"]);
    expect(foreignPackageManagers("windows").sort()).toEqual(["brew", "nix"]);
  });

  test("nix actions are build|switch|test|dry only", () => {
    expect([...NIX_ACTIONS]).toEqual(["build", "switch", "test", "dry"]);
  });

  test("foreign PM messages name the owning OS build", () => {
    expect(foreignPackageManagerMessage("scoop", "macos")).toContain("Windows");
    expect(foreignPackageManagerMessage("scoop", "macos")).toContain("macOS");
    expect(foreignPackageManagerMessage("brew", "windows")).toContain("macOS");
    expect(foreignPackageManagerMessage("brew", "macos")).toContain("available");
    expect(PACKAGE_MANAGER_PLATFORM.bun).toBe("all");
    expect(platformLabel("macos")).toBe("macOS");
  });
});
