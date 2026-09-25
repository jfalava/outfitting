import type { ManagerConfig } from "@/config/types";
import type { HostPlatform } from "@/platform";
import { envValue } from "@/secrets";

/** Resolve a per-invocation profile over environment and TOML selection. */
export function configuredProfile(
  config: ManagerConfig,
  platform: HostPlatform,
  override?: string,
): string | undefined {
  const selected = override ?? envValue("OUTFITTING_PROFILE");
  if (selected !== undefined) {
    return selected;
  }
  switch (platform) {
    case "linux":
      return config.linux?.profile;
    case "macos":
      return config.macos?.profile;
    case "windows":
      return config.windows?.profiles.join(",");
  }
}
