import { runCommand } from "@/process";

export interface ActivateNixSystemOptions {
  systemConfig: string;
  run?: typeof runCommand;
  user?: string;
}

function sudoEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.SUDO_HOME;
  delete env.NIX_PATH;
  return env;
}

/**
 * Activate a built nix-darwin system (matches outfit-activate-nix-system).
 * Requires interactive sudo after shell `sudo -v` priming on long runs.
 */
export async function activateNixSystem(options: ActivateNixSystemOptions): Promise<void> {
  const run = options.run ?? runCommand;
  const user = options.user ?? process.env.USER ?? process.env.LOGNAME ?? "";

  const setProfile = await run(
    "sudo",
    [
      "-H",
      "env",
      "HOME=/var/root",
      "NIX_PATH=",
      "nix-env",
      "-p",
      "/nix/var/nix/profiles/system",
      "--set",
      options.systemConfig,
    ],
    { inherit: true, env: sudoEnv({ HOME: "/var/root" }) },
  );
  if (setProfile.code !== 0) {
    throw new Error(`nix-env --set failed (exit ${setProfile.code}).`);
  }

  const activateArgs = ["-H", "env", "HOME=/var/root", "NIX_PATH="];
  const activateEnv = sudoEnv({ HOME: "/var/root" });
  if (user.length > 0) {
    activateArgs.push(`SUDO_USER=${user}`);
    activateEnv.SUDO_USER = user;
  }
  activateArgs.push(`${options.systemConfig}/sw/bin/darwin-rebuild`, "activate");

  const activate = await run("sudo", activateArgs, {
    inherit: true,
    env: activateEnv,
  });
  if (activate.code !== 0) {
    throw new Error(`darwin-rebuild activate failed (exit ${activate.code}).`);
  }
}
