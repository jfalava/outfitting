import { runCommand, type RunCommandOptions, type RunCommandResult } from "@/process";

/** Resolve Scoop's PowerShell shim from the path returned by `where scoop`. */
export function scoopScriptPath(shimPath: string): string {
  if (/\.cmd$/i.test(shimPath)) {
    return shimPath.replace(/\.cmd$/i, ".ps1");
  }
  return /\.ps1$/i.test(shimPath) ? shimPath : `${shimPath}.ps1`;
}

/** Invoke Scoop through PowerShell; its PATH entry is a `.cmd` shim, not an executable. */
export function runScoopCommand(
  run: typeof runCommand,
  scoopPath: string,
  args: ReadonlyArray<string>,
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  return run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scoopScriptPath(scoopPath),
      ...args,
    ],
    options,
  );
}
