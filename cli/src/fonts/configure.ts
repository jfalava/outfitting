import { Console, Effect } from "effect";

import { promptAndStoreR2Credentials, storeR2Endpoint } from "@/fonts/keychain";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

export const configureEndpoint = (requestedEndpoint?: string) =>
  Effect.gen(function* () {
    const value =
      requestedEndpoint ??
      prompt("R2 S3 endpoint or Cloudflare account ID (stored in your OS keychain):")?.trim();
    if (!value) {
      return yield* Effect.fail(new Error("An R2 endpoint is required."));
    }

    const endpoint = yield* tryPromise(() => storeR2Endpoint(value));
    yield* Console.log(ui.success(`Stored R2 endpoint: ${ui.key(endpoint)}`));
    return undefined;
  });

export const configureCredentials = Effect.gen(function* () {
  yield* tryPromise(promptAndStoreR2Credentials);
  yield* Console.log(ui.success("Stored R2 credentials in your OS keychain."));
});
