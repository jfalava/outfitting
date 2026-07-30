import { Console, Effect } from "effect";

import { ui } from "../ui";

import { tryPromise } from "./effect";
import { promptAndStoreApiToken, storeWorkerUrl } from "./keychain";

export const configureWorker = (requestedUrl?: string) =>
  Effect.gen(function* () {
    const value =
      requestedUrl ?? prompt("Lockfiles Worker URL (stored in your OS keychain):")?.trim();
    if (!value) {
      return yield* Effect.fail(new Error("A Worker URL is required."));
    }

    const url = yield* tryPromise(() => storeWorkerUrl(value));
    yield* Console.log(ui.success(`Stored Worker URL: ${ui.key(url)}`));
    return undefined;
  });

export const configureToken = Effect.gen(function* () {
  yield* tryPromise(promptAndStoreApiToken);
  yield* Console.log(ui.success("Stored API token in your OS keychain."));
});
