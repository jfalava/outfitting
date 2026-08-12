const ASSETS = {
  "darwin:arm64": "outfitting-manager-darwin-arm64",
  "darwin:x64": "outfitting-manager-darwin-x64",
  "linux:arm64": "outfitting-manager-linux-arm64",
  "linux:x64": "outfitting-manager-linux-x64",
  "win32:x64": "outfitting-manager-windows-x64.exe",
} as const;

const normalizePath = (path: string): string => path.replaceAll("\\", "/").toLowerCase();

export function assetNameFor(platform = process.platform, arch = process.arch): string {
  const asset = ASSETS[`${platform}:${arch}` as keyof typeof ASSETS];
  if (!asset) {
    throw new Error(`Self-update is not supported on ${platform}/${arch}.`);
  }
  return asset;
}

export function executablePath(main = Bun.main, execPath = process.execPath): string {
  const normalizedMain = normalizePath(main);
  const isCompiledBinary = normalizedMain.startsWith("/$bunfs/");
  if (!isCompiledBinary && normalizedMain !== normalizePath(execPath)) {
    throw new Error(
      "upgrade must be run from the compiled outfitting-manager binary, not from Bun source.",
    );
  }
  return execPath;
}
