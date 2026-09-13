import { Effect } from "effect";

import { toCliFailure, type CliFailure } from "@/errors";

export const toError = (cause: unknown): CliFailure => toCliFailure(cause);

export const tryPromise = <A>(try_: () => Promise<A>) =>
  Effect.tryPromise({
    try: try_,
    catch: toError,
  });
