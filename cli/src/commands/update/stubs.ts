import { CliFailure } from "@/errors";
import { foreignPackageManagerMessage, type HostPlatform, type PackageManager } from "@/platform";

/** Scaffold placeholder until the real package path lands. */
export const notImplementedYet = (commandPath: string) =>
  new CliFailure({ message: `${commandPath} is not implemented yet` });

/** Wrong-OS / stripped-PM hint for a registered stub command. */
export const foreignPackageManagerStub = (pm: PackageManager, host: HostPlatform) =>
  new CliFailure({ message: foreignPackageManagerMessage(pm, host) });
