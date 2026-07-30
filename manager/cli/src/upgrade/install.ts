import { spawn } from "node:child_process";
import { chmod, rename, writeFile } from "node:fs/promises";

import type { CliRelease } from "@/upgrade/release";

const quotePowerShellLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

async function download(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { "User-Agent": "outfitting-manager" },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }
  return response;
}

export function checksumFromFile(contents: string): string {
  const checksum = /^([a-fA-F0-9]{64})(?:\s|$)/.exec(contents.trim())?.[1];
  if (!checksum) {
    throw new Error("Release checksum file is invalid.");
  }
  return checksum.toLowerCase();
}

function scheduleWindowsReplacement(temporaryPath: string, targetPath: string): void {
  const script = [
    `Wait-Process -Id ${process.pid}`,
    `Move-Item -LiteralPath ${quotePowerShellLiteral(temporaryPath)} -Destination ${quotePowerShellLiteral(targetPath)} -Force`,
  ].join("; ");
  const child = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}

export async function installRelease(release: CliRelease, targetPath: string): Promise<void> {
  const [binaryResponse, checksumResponse] = await Promise.all([
    download(release.binaryUrl),
    download(release.checksumUrl),
  ]);
  const bytes = new Uint8Array(await binaryResponse.arrayBuffer());
  const expectedChecksum = checksumFromFile(await checksumResponse.text());
  const actualChecksum = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Downloaded binary checksum mismatch (expected ${expectedChecksum}, received ${actualChecksum}).`,
    );
  }

  const temporaryPath = `${targetPath}.upgrade-${process.pid}`;
  await writeFile(temporaryPath, bytes, { mode: 0o755 });

  if (process.platform === "win32") {
    scheduleWindowsReplacement(temporaryPath, targetPath);
    return;
  }

  await chmod(temporaryPath, 0o755);
  await rename(temporaryPath, targetPath);
}
