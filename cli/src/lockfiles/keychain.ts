import { maskedPrompt } from "@/lockfiles/masked-prompt";

const SECRET_SERVICE = "outfitting-lockfiles";
const TOKEN_SECRET_NAME = "api-token";
const URL_SECRET_NAME = "worker-url";

export function normalizeWorkerUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Worker URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Worker URL must use HTTP or HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

export async function storeWorkerUrl(value: string): Promise<string> {
  const url = normalizeWorkerUrl(value);
  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: URL_SECRET_NAME,
    value: url,
  });
  return url;
}

export async function baseUrl(): Promise<string> {
  const stored = await Bun.secrets.get({
    service: SECRET_SERVICE,
    name: URL_SECRET_NAME,
  });

  if (stored) {
    return normalizeWorkerUrl(stored);
  }

  const value = prompt(
    "Lockfiles Worker URL (stored in your OS keychain):",
  )?.trim();
  if (!value) {
    throw new Error("A Worker URL is required.");
  }

  return storeWorkerUrl(value);
}

export async function promptAndStoreApiToken(): Promise<string> {
  const token =
    (
      await maskedPrompt("Lockfiles API token (stored in your OS keychain): ")
    )?.trim() ?? null;
  if (!token) {
    throw new Error("An API token is required.");
  }

  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: TOKEN_SECRET_NAME,
    value: token,
  });
  return token;
}

export async function apiToken(): Promise<string> {
  // Bun.secrets is experimental and does not isolate credentials between scripts running as the same OS user. That is acceptable for this personal tool, but the keychain entry is not a hard security boundary.
  const token = await Bun.secrets.get({
    service: SECRET_SERVICE,
    name: TOKEN_SECRET_NAME,
  });

  return token || promptAndStoreApiToken();
}
