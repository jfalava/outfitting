/** Parse a Linux package manifest as one package name per line. */
export function parseLinuxPackageManifest(content: string): string[] {
  const packages: string[] = [];
  const seen = new Set<string>();
  for (const raw of content.split(/\r?\n/)) {
    const packageName = raw.split("#", 1)[0]?.trim();
    if (packageName === undefined || packageName.length === 0 || seen.has(packageName)) {
      continue;
    }
    if (
      !/^[a-z0-9][a-z0-9+._-]*(?::[a-z0-9][a-z0-9_-]*)?(?:=[a-zA-Z0-9][a-zA-Z0-9.+:~_-]*)?$/.test(
        packageName,
      )
    ) {
      throw new Error(`Invalid Linux package entry: ${raw.trim()}`);
    }
    seen.add(packageName);
    packages.push(packageName);
  }
  return packages;
}
