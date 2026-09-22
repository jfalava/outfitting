import { stat } from "node:fs/promises";

import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { resolveWindowsSource } from "@/commands/windows-apply";
import {
  autoMachineId,
  configFilePath,
  DEFAULT_LINUX_PROFILE,
  loadConfig,
  readRepoPathFile,
  type ManagerConfig,
} from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { type HostPlatform } from "@/platform";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { readWindowsLock } from "@/update/windows-lock";

async function sourcePathStatus(source: string): Promise<string | undefined> {
  try {
    if (!(await stat(source)).isDirectory()) {
      return "not a directory";
    }
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return "missing";
    }
    throw cause;
  }
  try {
    await stat(`${source}/.git`);
    return undefined;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return "local source (no Git metadata)";
    }
    throw cause;
  }
}

async function sourceStatus(source: string | undefined, run: typeof runCommand): Promise<string[]> {
  if (source === undefined) {
    return ["Source checkout: not configured"];
  }
  const lines = [`Source: ${source}`];
  const pathStatus = await sourcePathStatus(source);
  if (pathStatus !== undefined) {
    return [...lines, `Source checkout: ${pathStatus}`];
  }
  const result = await run(
    "git",
    ["--no-optional-locks", "-C", source, "status", "--porcelain=v1", "--branch"],
    { inherit: false },
  );
  if (result.code !== 0) {
    return [...lines, "Source checkout: Git status unavailable"];
  }
  const [branch, ...changes] = result.stdout.trimEnd().split("\n");
  return [
    ...lines,
    `Source checkout: ${changes.length > 0 ? "dirty" : "clean"}`,
    `Git: ${branch?.replace(/^## /, "") ?? "unknown"}`,
  ];
}

/** Inspect paths and Git without initializing state, fetching, or reading credentials. */
export async function readStatus(
  platform: HostPlatform,
  options: { config?: ManagerConfig; run?: typeof runCommand; envRepo?: string } = {},
): Promise<string> {
  const config = options.config ?? (await loadConfig());
  let profile = "macos";
  if (platform === "linux") {
    profile = config.linux?.profile ?? DEFAULT_LINUX_PROFILE;
  } else if (platform === "windows") {
    const lock = await readWindowsLock(config);
    if (lock.profiles.length > 0) {
      profile = lock.profiles.join(",");
    } else {
      const source = await resolveWindowsSource(config);
      profile = source.routes.defaultProfiles.join(",");
    }
  }
  const lines = [
    `Platform: ${platform} (${process.arch})`,
    `Profile: ${profile}`,
    `Config: ${configFilePath(config.stateRoot)}`,
    `Machine ID: ${config.machineId} (${config.machineIdOverridden ? "configured" : "inferred"})`,
    `Inferred machine ID: ${autoMachineId()}`,
    `Remote: ${config.manifest.baseUrl}/${config.manifest.ref}`,
  ];
  const source = options.envRepo ?? envValue("OUTFITTING_REPO") ?? (await readRepoPathFile(config));
  return [...lines, ...(await sourceStatus(source, options.run ?? runCommand))].join("\n");
}

export const makeStatusCommand = (platform: HostPlatform) =>
  Command.make("status", {}, () =>
    tryPromise(() => readStatus(platform)).pipe(Effect.flatMap(Console.log)),
  ).pipe(
    Command.withDescription("Inspect platform, profile, paths, machine ID, and source state."),
  );
