import { Console, Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";
import { installRelease } from "@/upgrade/install";
import { assetNameFor, executablePath } from "@/upgrade/platform";
import { latestCliRelease } from "@/upgrade/release";
import { isNewerVersion } from "@/upgrade/version";

export { checksumFromFile } from "@/upgrade/install";
export { assetNameFor, executablePath } from "@/upgrade/platform";
export { latestCliRelease } from "@/upgrade/release";
export { isNewerVersion, parseCliVersion } from "@/upgrade/version";

export const upgrade = (currentVersion: string) =>
  Effect.gen(function* () {
    const targetPath = executablePath();
    const release = yield* tryPromise(() => latestCliRelease(assetNameFor()));

    if (!isNewerVersion(release.version, currentVersion)) {
      yield* Console.log(ui.success(`outfitting-manager ${currentVersion} is already up to date.`));
      return;
    }

    yield* Console.log(`Updating outfitting-manager ${currentVersion} → ${release.version}…`);
    yield* tryPromise(() => installRelease(release, targetPath));
    const suffix = process.platform === "win32" ? " after this process exits" : "";
    yield* Console.log(ui.success(`Installed outfitting-manager ${release.version}${suffix}.`));
  });
