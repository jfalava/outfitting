import { Effect } from "effect";

import {
  foreignPackageManagerMessage,
  type HostPlatform,
  type PackageManager,
} from "@/platform";

/** Scaffold placeholder until the real package path lands. */
export const notImplementedYet = (commandPath: string) =>
  Effect.fail(new Error(`${commandPath} is not implemented yet`));

/** Wrong-OS / stripped-PM hint for a registered stub command. */
export const foreignPackageManagerStub = (pm: PackageManager, host: HostPlatform) =>
  Effect.fail(new Error(foreignPackageManagerMessage(pm, host)));
