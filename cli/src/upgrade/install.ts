import { spawn } from "node:child_process";
import { chmod, rename, writeFile } from "node:fs/promises";

import { extractZipBinary } from "@/upgrade/archive";
import type { CliRelease } from "@/upgrade/release";

const quotePowerShellLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 500] as const;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

class DownloadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : String(cause);
}

function isRetryableNetworkError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    /connection|fetch|network|socket|timeout/i.test(cause.message)
  );
}

function waitForRetry(attempt: number): Promise<void> {
  const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function downloadAttempt(
  url: string,
  label: string,
  fetcher: Fetcher,
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { "User-Agent": "outfitting-manager" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new DownloadError(
        `${label} failed with HTTP ${response.status}: ${url}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new DownloadError(
        `${label} timed out after ${DOWNLOAD_TIMEOUT_MS}ms.`,
        true,
      );
    }
    if (cause instanceof DownloadError) {
      throw cause;
    }
    throw new DownloadError(
      `${label}: ${errorMessage(cause)}`,
      isRetryableNetworkError(cause),
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadBytes(
  url: string,
  label: string,
  fetcher: Fetcher = fetch,
): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await downloadAttempt(url, label, fetcher);
    } catch (cause) {
      lastError = cause;
      if (
        !(cause instanceof DownloadError && cause.retryable) ||
        attempt === DOWNLOAD_ATTEMPTS
      ) {
        throw cause;
      }
      await waitForRetry(attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed.`);
}

export function checksumFromFile(contents: string): string {
  const checksum = /^([a-fA-F0-9]{64})(?:\s|$)/.exec(contents.trim())?.[1];
  if (!checksum) {
    throw new Error("Release checksum file is invalid.");
  }
  return checksum.toLowerCase();
}

function scheduleWindowsReplacement(
  temporaryPath: string,
  targetPath: string,
): void {
  const script = [
    `Wait-Process -Id ${process.pid}`,
    `Move-Item -LiteralPath ${quotePowerShellLiteral(temporaryPath)} -Destination ${quotePowerShellLiteral(targetPath)} -Force`,
  ].join("; ");
  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      script,
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}

export async function installRelease(
  release: CliRelease,
  targetPath: string,
): Promise<void> {
  const assetBytes = await downloadBytes(release.assetUrl, "Release asset");
  const checksumBytes = await downloadBytes(
    release.checksumUrl,
    "Release checksum",
  );
  const expectedChecksum = checksumFromFile(
    new TextDecoder().decode(checksumBytes),
  );
  const actualChecksum = new Bun.CryptoHasher("sha256")
    .update(assetBytes)
    .digest("hex");
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Downloaded release asset checksum mismatch (expected ${expectedChecksum}, received ${actualChecksum}).`,
    );
  }

  const bytes =
    release.format === "zip"
      ? extractZipBinary(assetBytes, release.executableName)
      : assetBytes;

  const temporaryPath = `${targetPath}.upgrade-${process.pid}`;
  await writeFile(temporaryPath, bytes, { mode: 0o755 });

  if (process.platform === "win32") {
    scheduleWindowsReplacement(temporaryPath, targetPath);
    return;
  }

  await chmod(temporaryPath, 0o755);
  await rename(temporaryPath, targetPath);

  // On macOS, ad-hoc sign the binary so it can access the keychain (Bun.secrets) without being killed (exit 137).
  // Newer Bun versions produce unsigned binaries that are killed on first keychain access, causing silent outfit failures.
  if (process.platform === "darwin") {
    try {
      const proc = Bun.spawn(
        ["codesign", "--force", "--sign", "-", targetPath],
        {
          stdout: "ignore",
          stderr: "ignore",
        },
      );
      await proc.exited;
      if (proc.exitCode !== 0) {
        console.warn(
          `Warning: codesign failed for ${targetPath} (exit ${proc.exitCode}). The binary may be killed on keychain access (exit 137). Run 'codesign --force --sign - ${targetPath}' manually.`,
        );
      }
    } catch (cause) {
      console.warn(
        `Warning: Could not codesign ${targetPath}: ${cause instanceof Error ? cause.message : String(cause)}. The binary may be killed on keychain access.`,
      );
    }
  }
}
