import { apiToken, baseUrl } from "@/lockfiles/keychain";
import type { CliRequestInit } from "@/lockfiles/types";

async function endpoint(parts: ReadonlyArray<string>): Promise<string> {
  return `${await baseUrl()}/${parts.map(encodeURIComponent).join("/")}`;
}

export async function request(
  parts: ReadonlyArray<string>,
  init: CliRequestInit = {},
): Promise<Response> {
  const url = await endpoint(parts);
  const token = await apiToken();
  const headers = { ...init.headers, Authorization: `Bearer ${token}` };

  const response = await fetch(url, { ...init, headers });
  if (response.ok) {
    return response;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  let detail = response.statusText;
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      detail = body.error;
    }
  } else {
    detail = (await response.text()) || detail;
  }

  throw new Error(`Worker returned ${response.status}: ${detail}`);
}
