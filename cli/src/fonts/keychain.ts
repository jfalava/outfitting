import { maskedPrompt } from "@/lockfiles/masked-prompt";
import { envValue, inAmpOrb, storedSecret } from "@/secrets";

const SECRET_SERVICE = "outfitting-fonts";
const ENDPOINT_SECRET_NAME = "r2-endpoint";
const ACCESS_KEY_SECRET_NAME = "r2-access-key-id";
const SECRET_KEY_SECRET_NAME = "r2-secret-access-key";

const ACCOUNT_ID = /^[0-9a-f]{32}$/i;

export interface R2Credentials {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export function normalizeR2Endpoint(value: string): string {
  const trimmed = value.trim();
  if (ACCOUNT_ID.test(trimmed)) {
    return `https://${trimmed.toLowerCase()}.r2.cloudflarestorage.com`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("R2 endpoint must be an HTTPS URL or a 32-character Cloudflare account ID.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("R2 endpoint must use HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

export async function storeR2Endpoint(value: string): Promise<string> {
  const endpoint = normalizeR2Endpoint(value);
  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: ENDPOINT_SECRET_NAME,
    value: endpoint,
  });
  return endpoint;
}

export async function r2Endpoint(): Promise<string> {
  if (inAmpOrb()) {
    const fromEnv = envValue("OUTFITTING_S3_ENDPOINT");
    if (!fromEnv) {
      throw new Error("OUTFITTING_S3_ENDPOINT is required in an Amp orb.");
    }
    return normalizeR2Endpoint(fromEnv);
  }

  const stored = await storedSecret(SECRET_SERVICE, ENDPOINT_SECRET_NAME);
  if (stored) {
    return normalizeR2Endpoint(stored);
  }

  const value = prompt(
    "R2 S3 endpoint or Cloudflare account ID (stored in your OS keychain):",
  )?.trim();
  if (!value) {
    throw new Error("An R2 endpoint is required.");
  }
  return storeR2Endpoint(value);
}

export async function storeR2Credentials(
  accessKeyId: string,
  secretAccessKey: string,
): Promise<void> {
  const id = accessKeyId.trim();
  const secret = secretAccessKey.trim();
  if (!id || !secret) {
    throw new Error("An R2 access key ID and secret access key are required.");
  }
  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: ACCESS_KEY_SECRET_NAME,
    value: id,
  });
  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: SECRET_KEY_SECRET_NAME,
    value: secret,
  });
}

export async function promptAndStoreR2Credentials(): Promise<void> {
  const accessKeyId = prompt("R2 access key ID (stored in your OS keychain):")?.trim();
  const secretAccessKey =
    (await maskedPrompt("R2 secret access key (stored in your OS keychain): "))?.trim() ?? null;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("An R2 access key ID and secret access key are required.");
  }
  await storeR2Credentials(accessKeyId, secretAccessKey);
}

async function storedCredential(name: string): Promise<string | null> {
  return storedSecret(SECRET_SERVICE, name);
}

export async function r2Credentials(): Promise<R2Credentials> {
  if (inAmpOrb()) {
    const endpoint = await r2Endpoint();
    const accessKeyId = envValue("OUTFITTING_S3_ACCESS_KEY");
    const secretAccessKey = envValue("OUTFITTING_S3_SECRET_KEY");
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "OUTFITTING_S3_ACCESS_KEY and OUTFITTING_S3_SECRET_KEY are required in an Amp orb.",
      );
    }
    return { endpoint, accessKeyId, secretAccessKey };
  }

  const endpoint = await r2Endpoint();
  const accessKeyId = await storedCredential(ACCESS_KEY_SECRET_NAME);
  const secretAccessKey = await storedCredential(SECRET_KEY_SECRET_NAME);
  if (accessKeyId && secretAccessKey) {
    return { endpoint, accessKeyId, secretAccessKey };
  }
  await promptAndStoreR2Credentials();
  const storedId = await storedCredential(ACCESS_KEY_SECRET_NAME);
  const storedSecretValue = await storedCredential(SECRET_KEY_SECRET_NAME);
  if (!storedId || !storedSecretValue) {
    throw new Error("An R2 access key ID and secret access key are required.");
  }
  return { endpoint, accessKeyId: storedId, secretAccessKey: storedSecretValue };
}
