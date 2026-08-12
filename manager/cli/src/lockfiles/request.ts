import { Option, Schema } from "effect";

import { apiToken, baseUrl } from "@/lockfiles/keychain";
import type { CliRequestInit } from "@/lockfiles/types";

const ErrorResponseSchema = Schema.Struct({ error: Schema.String });
const decodeErrorResponse = Schema.decodeUnknownOption(ErrorResponseSchema);

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

  const response = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (response.ok) {
    return response;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  let detail = response.statusText;
  if (contentType.includes("application/json")) {
    const body = decodeErrorResponse(await response.json());
    if (Option.isSome(body)) {
      detail = body.value.error;
    }
  } else {
    detail = (await response.text()) || detail;
  }

  throw new Error(`Worker returned ${response.status}: ${detail}`);
}
