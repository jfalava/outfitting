import { describe, expect, test } from "vitest";

import { foreignPackageManagerMessage, foreignPackageManagers, platformLabel } from "@/platform";

describe("package manager availability table", () => {
  test("macos natives and foreign hint set", () => {
    expect(foreignPackageManagers("macos").sort()).toEqual(["apt", "pacman", "scoop", "winget"]);
    expect(foreignPackageManagers("windows").sort()).toEqual(["apt", "brew", "pacman"]);
    expect(foreignPackageManagers("linux").sort()).toEqual(["brew", "scoop", "winget"]);
  });

  test("foreign PM messages name the owning OS build", () => {
    expect(foreignPackageManagerMessage("scoop", "macos")).toContain("Windows");
    expect(foreignPackageManagerMessage("scoop", "macos")).toContain("macOS");
    expect(foreignPackageManagerMessage("brew", "windows")).toContain("macOS");
    expect(foreignPackageManagerMessage("brew", "macos")).toContain("available");
    expect(platformLabel("macos")).toBe("macOS");
  });
});
