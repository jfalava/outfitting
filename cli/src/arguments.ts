export function normalizeCommandAlias(args: ReadonlyArray<string>): string[] {
  const normalized: string[] = [];
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--config") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--config requires a path.");
      }
      if (configPath !== undefined) {
        throw new Error("Pass --config only once.");
      }
      configPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      if (configPath !== undefined || arg.length === "--config=".length) {
        throw new Error("--config requires one path and may be passed only once.");
      }
      configPath = arg.slice("--config=".length);
      continue;
    }
    normalized.push(arg);
  }
  if (configPath !== undefined) {
    process.env.OUTFITTING_CONFIG = configPath;
  }
  return normalized;
}
