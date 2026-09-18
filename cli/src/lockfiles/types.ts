export interface PushLockfileOptions {
  /** Defaults to the configured/auto machine id when omitted. */
  machine?: string;
  /** Lockfile kind, or `all` / omitted to push every known local kind path that exists. */
  kind?: string;
  /** Required unless kind is `all` (or omitted). */
  path?: string;
  ifMatch?: string;
}

export interface PullLockfileOptions {
  /** Defaults to the configured/auto machine id when omitted. */
  machine?: string;
  /** Lockfile kind, or `all` / omitted to pull every kind tracked for the machine. */
  kind?: string;
  outPath?: string;
}

export interface HistoryLockfileOptions {
  /** Defaults to the configured/auto machine id when omitted. */
  machine?: string;
  /** Lockfile kind, or `all` / omitted to show history for every tracked kind. */
  kind?: string;
}

export interface ListLockfileOptions {
  /** Defaults to the configured/auto machine id when omitted. */
  machine?: string;
}

export interface CliRequestInit {
  body?: ArrayBuffer | Uint8Array;
  headers?: Record<string, string>;
  method?: "PUT";
  signal?: AbortSignal;
}
