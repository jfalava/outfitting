import pc from "picocolors";

export const ui = {
  success: (message: string): string => `${pc.green("✓")} ${message}`,
  key: (value: string): string => pc.cyan(value),
  hash: (value: string): string => pc.yellow(value),
  muted: (value: string): string => pc.dim(value),
  heading: (value: string): string => pc.bold(value),
};
