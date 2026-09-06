export function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function inAmpOrb(): boolean {
  return envValue("AMP_ORB") === "1";
}

export async function storedSecret(service: string, name: string): Promise<string | null> {
  try {
    return await Bun.secrets.get({
      service,
      name,
    });
  } catch (cause) {
    if (isUnavailableSecretsStore(cause)) {
      return null;
    }
    throw cause;
  }
}

function isUnavailableSecretsStore(cause: unknown): boolean {
  if (!(cause instanceof Error) || !("code" in cause)) {
    return false;
  }
  return cause.code === "ERR_SECRETS_PLATFORM_ERROR";
}
