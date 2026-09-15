import { CliFailure } from "@/errors";
import { foreignPackageManagerMessage, type HostPlatform, type PackageManager } from "@/platform";

/** Wrong-OS / stripped-PM hint for a registered stub command. */
export const foreignPackageManagerStub = (pm: PackageManager, host: HostPlatform) =>
  new CliFailure({ message: foreignPackageManagerMessage(pm, host) });
