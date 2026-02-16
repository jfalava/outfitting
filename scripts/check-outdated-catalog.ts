#!/usr/bin/env bun
/* eslint-disable no-console */

/**
 * Workspace catalog usage updater.
 *
 * This script enforces consistent use of the root `workspaces.catalog` across the monorepo
 * by automatically updating violations.
 *
 * Rules:
 * - For every dependency key declared in root `workspaces.catalog`:
 *   - If a workspace uses that dependency, it MUST use `"catalog:"` as the version.
 *   - Any other version/range for those keys will be automatically updated to "catalog:".
 *
 * Notes:
 * - Dependencies not present in the root catalog are ignored.
 * - This script modifies package.json files to fix catalog violations.
 * - Implementation is Node/Bun compatible and does not rely on external glob libraries.
 *
 * Usage:
 *
 *   # Update catalog violations (recommended command):
 *   bun run update:catalog:usage
 *
 *   # Legacy check command (still available):
 *   bun run check:catalog
 *
 * Both commands run the same script - it now automatically fixes violations instead of just reporting them.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { argv } from "node:process";

type DepRecord = Record<string, string>;

type WorkspacesObject = {
  packages?: unknown;
  catalogs?: unknown;
  catalog?: unknown;
};

type PackageJson = {
  name?: string;
  private?: boolean;
  workspaces?: string[] | WorkspacesObject;
  dependencies?: DepRecord;
  devDependencies?: DepRecord;
  peerDependencies?: DepRecord;
  optionalDependencies?: DepRecord;
};

type WorkspaceViolation = {
  file: string;
  pkgName: string;
  depType:
    | "dependencies"
    | "devDependencies"
    | "peerDependencies"
    | "optionalDependencies";
  depName: string;
  actual: string;
};

type WorkspaceFix = WorkspaceViolation & {
  fixed: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readJson(path: string): PackageJson | null {
  try {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Resolve repo root and root package.json path.
 *
 * We assume this script lives at:
 *   <root>/scripts/check-catalog-usage.ts
 */
function getRootPaths() {
  const scriptPath = argv[1];
  if (!scriptPath) {
    throw new Error("Unable to resolve script path from argv[1].");
  }
  const scriptsDir = dirname(scriptPath);
  const rootDir = dirname(scriptsDir);
  const rootPkgPath = join(rootDir, "package.json");
  return { rootDir, rootPkgPath };
}

/**
 * Extract the catalog map from root workspaces config.
 */
function getRootCatalog(rootPkgPath: string): DepRecord {
  const rootPkg = readJson(rootPkgPath);
  if (!rootPkg) {
    throw new Error(`Unable to read root package.json at ${rootPkgPath}`);
  }

  const ws = rootPkg.workspaces;
  if (!ws) {
    return {};
  }

  let catalogSource: unknown;

  if (Array.isArray(ws)) {
    catalogSource = undefined;
  } else if (isRecord(ws)) {
    const maybeCatalogs = (ws as WorkspacesObject).catalogs;
    const maybeCatalog = (ws as WorkspacesObject).catalog;
    catalogSource = maybeCatalogs ?? maybeCatalog;
  }

  if (!isRecord(catalogSource)) {
    return {};
  }

  const catalog: DepRecord = {};
  function extractCatalogEntries(obj: unknown) {
    if (isRecord(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" && value.trim()) {
          catalog[key] = value;
        } else if (isRecord(value)) {
          extractCatalogEntries(value);
        }
      }
    }
  }
  extractCatalogEntries(catalogSource);
  return catalog;
}

function getGroupForPackage(pkgName: string, rootPkgPath: string): string {
  const rootPkg = readJson(rootPkgPath);
  if (
    !rootPkg?.workspaces ||
    Array.isArray(rootPkg.workspaces) ||
    !isRecord(rootPkg.workspaces)
  ) {
    return "";
  }
  const catalogsSource = rootPkg.workspaces.catalogs;
  const catalogSource = rootPkg.workspaces.catalog;
  const source = isRecord(catalogsSource)
    ? catalogsSource
    : isRecord(catalogSource)
      ? catalogSource
      : null;
  if (!isRecord(source)) {
    return "";
  }

  function findGroup(obj: unknown, groupName: string = ""): string {
    if (isRecord(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        if (key === pkgName && typeof value === "string") {
          return groupName;
        }
        if (isRecord(value)) {
          const found = findGroup(value, key);
          if (found) return found;
        }
      }
    }
    return "";
  }

  return findGroup(source);
}

/**
 * Extract workspace package patterns from root workspaces config.
 * We only care about the "packages" list if object form is used,
 * or the top-level array if array form is used.
 */
function getWorkspacePatterns(rootPkgPath: string): string[] {
  const rootPkg = readJson(rootPkgPath);
  if (!rootPkg) {
    throw new Error(`Unable to read root package.json at ${rootPkgPath}`);
  }

  const ws = rootPkg.workspaces;
  if (!ws) {
    return [];
  }

  if (Array.isArray(ws)) {
    return ws.map((x) => String(x)).filter((x) => x.length > 0);
  }

  if (isRecord(ws)) {
    const wso = ws as WorkspacesObject;
    if (Array.isArray(wso.packages)) {
      return (wso.packages as unknown[])
        .map((x) => String(x))
        .filter((x) => x.length > 0);
    }
  }

  return [];
}

/**
 * Very small glob-like helper for the patterns they actually use:
 * - "web/*"
 * - "functions/*"
 * - "backends/*"
 * - "utils/*"
 * - or direct paths like "some-package"
 *
 * We intentionally avoid a full glob engine.
 */
function resolveWorkspacePatternToDirs(
  rootDir: string,
  pattern: string,
): string[] {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return [];
  }

  // Handle simple "dir/*" pattern: list all immediate subdirectories.
  const starIndex = trimmed.indexOf("*");
  if (starIndex >= 0) {
    // Only support suffix "/*" and no other glob chars.
    if (trimmed.endsWith("/*") && trimmed.indexOf("*") === trimmed.length - 1) {
      const baseDirRel = trimmed.slice(0, -2); // remove "/*"
      const baseDir = join(rootDir, baseDirRel);
      let entries: string[];
      try {
        entries = readdirSync(baseDir);
      } catch {
        return [];
      }

      const dirs: string[] = [];
      for (const entry of entries) {
        const full = join(baseDir, entry);
        try {
          if (statSync(full).isDirectory()) {
            dirs.push(full);
          }
        } catch {
          // Ignore entries we can't stat
        }
      }
      return dirs;
    }

    // Unsupported glob shape: ignore safely.
    return [];
  }

  // No star: treat as direct workspace directory path.
  const directDir = join(rootDir, trimmed);
  try {
    if (statSync(directDir).isDirectory()) {
      return [directDir];
    }
  } catch {
    // If it's not a directory, maybe pattern pointed straight at a package directory
  }

  return [];
}

/**
 * Collect paths to workspace package.json files based on workspace patterns.
 */
function collectWorkspacePackageJsonPaths(
  rootDir: string,
  patterns: string[],
): string[] {
  const pkgPaths = new Set<string>();

  for (const pattern of patterns) {
    const dirs = resolveWorkspacePatternToDirs(rootDir, pattern);
    for (const dir of dirs) {
      const pkgPath = join(dir, "package.json");
      try {
        if (statSync(pkgPath).isFile()) {
          pkgPaths.add(pkgPath);
        }
      } catch {
        // no package.json here, skip
      }
    }
  }

  return Array.from(pkgPaths);
}

/**
 * Fix catalog violations in a single workspace package.json.
 */
function fixPackageJson(
  filePath: string,
  pkg: PackageJson,
  catalog: DepRecord,
  rootPkgPath: string,
): WorkspaceFix[] {
  const fixes: WorkspaceFix[] = [];
  const pkgName =
    pkg.name ??
    filePath
      .replace(/\\/g, "/")
      .replace(/^.*\//, "")
      .replace(/\.json$/, "");

  const depTypes: Array<
    | "dependencies"
    | "devDependencies"
    | "peerDependencies"
    | "optionalDependencies"
  > = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];

  let hasChanges = false;

  for (const depType of depTypes) {
    const deps = pkg[depType];
    if (!deps || !isRecord(deps)) {
      continue;
    }

    const typedDeps = deps as DepRecord;

    for (const [depName, version] of Object.entries(typedDeps)) {
      if (!(depName in catalog)) {
        continue;
      }

      const expectedVersion = `catalog:${getGroupForPackage(depName, rootPkgPath)}`;
      if (version !== expectedVersion) {
        (typedDeps as Record<string, string>)[depName] = expectedVersion;
        hasChanges = true;

        fixes.push({
          file: filePath,
          pkgName,
          depType,
          depName,
          actual: version,
          fixed: true,
        });
      }
    }
  }

  // Write the updated package.json back to disk if we made changes
  if (hasChanges) {
    try {
      const updatedJson = JSON.stringify(pkg, null, 2) + "\n";
      writeFileSync(filePath, updatedJson, "utf8");
      console.log(`✅ Updated ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to update ${filePath}:`, error);
      // Mark all fixes as failed if we couldn't write the file
      fixes.forEach((fix) => {
        fix.fixed = false;
      });
    }
  }

  return fixes;
}

/**
 * Entry point.
 */
function main(): void {
  const { rootDir, rootPkgPath } = getRootPaths();

  const catalog = getRootCatalog(rootPkgPath);
  if (Object.keys(catalog).length === 0) {
    console.log(
      "No root workspaces.catalog entries found in package.json. Nothing to update.",
    );
    return;
  }

  const patterns = getWorkspacePatterns(rootPkgPath);
  if (patterns.length === 0) {
    console.log(
      "No workspaces configuration with packages/globs found in root package.json. Nothing to update.",
    );
    return;
  }

  const workspacePkgPaths = collectWorkspacePackageJsonPaths(rootDir, patterns);

  const allFixes: WorkspaceFix[] = [];

  for (const pkgPath of workspacePkgPaths) {
    const pkg = readJson(pkgPath);
    if (!pkg) {
      continue;
    }

    const fixes = fixPackageJson(pkgPath, pkg, catalog, rootPkgPath);
    if (fixes.length > 0) {
      allFixes.push(...fixes);
    }
  }

  if (allFixes.length === 0) {
    console.log(
      '✅ All workspaces already correctly use "catalog:" for catalog-managed dependencies.',
    );
    return;
  }

  console.log("\n📋 Summary of updates:");

  const successfulFixes = allFixes.filter((fix) => fix.fixed);
  const failedFixes = allFixes.filter((fix) => !fix.fixed);

  for (const fix of successfulFixes) {
    console.log(
      `✅ ${fix.file} (${fix.pkgName}) :: ${fix.depType}.${fix.depName}: "${fix.actual}" → "catalog:"`,
    );
  }

  if (failedFixes.length > 0) {
    console.log("\n❌ Failed updates:");
    for (const fix of failedFixes) {
      console.log(
        `❌ ${fix.file} (${fix.pkgName}) :: ${fix.depType}.${fix.depName}: "${fix.actual}" → "catalog:"`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      `\n🎉 Successfully updated ${successfulFixes.length} dependencies to use "catalog:"`,
    );
  }
}

main();
