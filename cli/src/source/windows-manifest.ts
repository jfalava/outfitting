export interface WindowsWingetPackage {
  name: string;
  source?: "msstore";
}

function wingetListIdentity(name: string, source?: "msstore"): string {
  return `${source ?? "winget"}:${name}`.toLowerCase();
}

/** Parse a WinGet package list (one package id per line; optional `msstore:` prefix). */
export function parseWindowsPackageList(content: string, path: string): WindowsWingetPackage[] {
  const packages: WindowsWingetPackage[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const value = raw.trim();
    if (value.length === 0 || value.startsWith("#")) {
      continue;
    }
    const isStore = /^msstore:/i.test(value);
    const name = isStore ? value.slice("msstore:".length) : value;
    if (!/^(?!-)[^\s:]+$/.test(name)) {
      invalid.push(`line ${index + 1}: ${value}`);
      continue;
    }
    const source = isStore ? ("msstore" as const) : undefined;
    const key = wingetListIdentity(name, source);
    if (!seen.has(key)) {
      seen.add(key);
      packages.push(source === undefined ? { name } : { name, source });
    }
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid WinGet manifest entries in ${path}: ${invalid.join("; ")}`);
  }
  return packages;
}
