export function normalizeCommandAlias(args: ReadonlyArray<string>): string[] {
  if (args[0] === "ugprade") {
    return ["upgrade", ...args.slice(1)];
  }
  return [...args];
}
