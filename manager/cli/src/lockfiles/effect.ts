import { Effect } from "effect";

export const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const tryPromise = <A>(try_: () => Promise<A>) =>
  Effect.tryPromise({
    try: try_,
    catch: toError,
  });
