export interface PushResult {
  hash: string;
  size: number;
}

export interface HistoryEntry extends PushResult {
  created_at: string;
}

export interface PushLockfileOptions {
  machine: string;
  kind: string;
  path: string;
  ifMatch?: string;
}

export interface PullLockfileOptions {
  machine: string;
  kind: string;
  outPath?: string;
}

export interface CliRequestInit {
  body?: ArrayBuffer;
  headers?: Record<string, string>;
  method?: "PUT";
  signal?: AbortSignal;
}
