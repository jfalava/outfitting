#!/usr/bin/env bun
/* eslint-disable no-console */

/**
 * Workspace catalog usage validator.
 *
 * This script enforces consistent use of the root `workspaces.catalog` across the monorepo.
 *
 * Rules:
 * - For every dependency key declared in root `workspaces.catalog`:
 *   - If a workspace uses that dependency, it MUST use `"catalog:"` as the version.
 *   - Any other version/range for those keys is considered a violation.
 *
 * Notes:
 * - Dependencies not present in the root catalog are ignored.
 * - This is a read-only check; it does not modify any files.
 * - Implementation is Node/Bun compatible and does not rely on external glob libraries.
 *
 * Recommended usage (in root package.json):
 *
 *   "scripts": {
 *     "check:catalog": "bun scripts/check-catalog-usage.ts"
 *   }
 *
 * Then run:
 *
 *   bun run check:catalog
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import process from "node:process";

type DepRecord = Record<string, string>;

type WorkspacesObject = {
  packages?: unknown;
  catalog?: unknown;
  catalogs?: unknown;
};

type PackageJson = {
  name?: string;
  private?: boolean;
  workspaces?: string[] | WorkspacesObject;
  catalog?: DepRecord;
  catalogs?: DepRecord;
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
  const scriptPath = process.argv[1];
  const scriptsDir = dirname(scriptPath);
  const rootDir = dirname(scriptsDir);
  const rootPkgPath = join(rootDir, "package.json");
  return { rootDir, rootPkgPath };
}

/**
 * Extract the catalog map from root package.json.
 *
 * Supports multiple formats:
 * 1. Bun: catalog (top-level field)
 * 2. Legacy: workspaces.catalog (nested under workspaces)
 * 3. Multiple catalogs: workspaces.catalogs (multiple named catalogs)
 */
function getRootCatalog(rootPkgPath: string): DepRecord {
  const rootPkg = readJson(rootPkgPath);
  if (!rootPkg) {
    throw new Error(`Unable to read root package.json at ${rootPkgPath}`);
  }

  const catalog: DepRecord = {};

  // Check for Bun-style top-level catalog first
  if (rootPkg.catalog && isRecord(rootPkg.catalog)) {
    for (const [key, value] of Object.entries(rootPkg.catalog)) {
      if (typeof value === "string" && value.trim()) {
        catalog[key] = value;
      }
    }
  }

  // Check for multiple catalogs under workspaces
  const ws = rootPkg.workspaces;
  if (ws && isRecord(ws)) {
    const wso = ws as WorkspacesObject;

    // Check for single catalog
    if (wso.catalog && isRecord(wso.catalog)) {
      for (const [key, value] of Object.entries(wso.catalog)) {
        if (typeof value === "string" && value.trim()) {
          catalog[key] = value;
        }
      }
    }

    // Check for multiple catalogs
    if (wso.catalogs && isRecord(wso.catalogs)) {
      for (const catalogGroup of Object.values(wso.catalogs)) {
        if (isRecord(catalogGroup)) {
          for (const [key, value] of Object.entries(catalogGroup)) {
            if (typeof value === "string" && value.trim()) {
              catalog[key] = value;
            }
          }
        }
      }
    }
  }

  return catalog;
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
 * Validate a single workspace package.json against the catalog rules.
 */
function validatePackageJson(
  filePath: string,
  pkg: PackageJson,
  catalog: DepRecord,
): WorkspaceViolation[] {
  const violations: WorkspaceViolation[] = [];
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

      // Check for both simple "catalog:" and named "catalog:name" formats
      if (!version.startsWith("catalog:")) {
        violations.push({
          file: filePath,
          pkgName,
          depType,
          depName,
          actual: version,
        });
      }
    }
  }

  return violations;
}

/**
 * Entry point.
 */
function main(): void {
  const { rootDir, rootPkgPath } = getRootPaths();

  const catalog = getRootCatalog(rootPkgPath);
  if (Object.keys(catalog).length === 0) {
    console.log(
      "No root workspaces.catalog entries found in package.json. Nothing to validate.",
    );
    return;
  }

  const patterns = getWorkspacePatterns(rootPkgPath);
  if (patterns.length === 0) {
    console.log(
      "No workspaces configuration with packages/globs found in root package.json. Nothing to validate.",
    );
    return;
  }

  const workspacePkgPaths = collectWorkspacePackageJsonPaths(rootDir, patterns);

  const allViolations: WorkspaceViolation[] = [];

  for (const pkgPath of workspacePkgPaths) {
    const pkg = readJson(pkgPath);
    if (!pkg) {
      continue;
    }

    const violations = validatePackageJson(pkgPath, pkg, catalog);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  }

  if (allViolations.length === 0) {
    console.log(
      '✅ All workspaces correctly use "catalog:" for catalog-managed dependencies.',
    );
    return;
  }

  console.error(
    '❌ Detected dependencies that should use "catalog:" but are using explicit versions instead:\n',
  );

  for (const v of allViolations) {
    console.error(
      `- ${v.file} (${v.pkgName}) :: ${v.depType}.${v.depName} = "${v.actual}" (expected "catalog:")`,
    );
  }

  console.error(
    '\nTo fix: for each entry above, change the version to "catalog:" so it follows the root workspaces.catalog.',
  );

  process.exitCode = 1;
}

main();
