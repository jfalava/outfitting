import { link, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { loadConfig } from "@/config/load";

/** Validate and atomically publish a new config file without overwriting one. */
export async function publishValidatedConfig(
  stateRoot: string,
  target: string,
  serialized: string,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporaryDir = await mkdtemp(join(dirname(target), ".outfitting-config-"));
  const temporary = join(temporaryDir, "config.toml");
  try {
    await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
    const verified = await loadConfig({ stateRoot, configPath: temporary });
    if (verified.declarations === undefined || verified.source === undefined) {
      throw new Error("Generated config.toml failed validation before publication.");
    }
    await link(temporary, target);
  } finally {
    await rm(temporaryDir, { force: true, recursive: true });
  }
}
