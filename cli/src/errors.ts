import { Data } from "effect";

export class CliFailure extends Data.TaggedError("CliFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const toCliFailure = (cause: unknown, message?: string): CliFailure =>
  cause instanceof CliFailure
    ? cause
    : new CliFailure({
        message: message ?? (cause instanceof Error ? cause.message : String(cause)),
        cause,
      });
