/** One normalised event from any source. The config maps `event` to a skill. */
export interface Signal {
  id: string;
  source: string;
  /** `<source>.<thing>.<verb>`, for example `cal-com.booking.created`. */
  event: string;
  occurredAt: string;
  receivedAt: string;
  subject: Subject;
  payload: Record<string, unknown>;
}

/** Who or what the signal is about. Every field is optional. */
export interface Subject {
  email?: string;
  name?: string;
  company?: string;
  domain?: string;
  url?: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  skill: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  /** Free-form input the skill reads from its payload file. */
  input: Record<string, unknown>;
  signal?: Signal;
  /** Bearer the agent must send to POST /jobs/:id/complete. */
  token: string;
  summary?: string;
  error?: string;
  writes?: WriteResult[];
  draftIds?: string[];
  costUsd?: number;
}

/** A write the agent asks the server to make on its behalf. */
export interface WriteRequest {
  integration: string;
  action: string;
  input: Record<string, unknown>;
}

export interface WriteResult extends WriteRequest {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Something a human reviews before it goes anywhere. Nothing sends a draft. */
export interface Draft {
  id: string;
  jobId: string;
  kind: "email" | "message" | "note";
  to?: string;
  subject?: string;
  body: string;
  createdAt: string;
}

export interface Completion {
  summary: string;
  writes?: WriteRequest[];
  drafts?: Array<Omit<Draft, "id" | "jobId" | "createdAt">>;
}

export type IntegrationKind = "signal" | "pull" | "tool" | "write";

export interface EnvVar {
  name: string;
  required?: boolean;
  about?: string;
}

export interface Manifest {
  name: string;
  kind: IntegrationKind;
  description: string;
  env: EnvVar[];
  /** Events a signal or pull integration emits. */
  events?: string[];
  /** Skills in `.claude/skills/` this integration expects. */
  skills?: string[];
  /** Pulls only: default cron expression. */
  schedule?: string;
  /** Merged into gtm.config.yaml by `gtm add`. Existing keys win. */
  defaults?: { on?: Record<string, string>; settings?: Record<string, unknown> };
}

export interface WebhookRequest {
  headers: Record<string, string>;
  query: Record<string, string>;
  rawBody: string;
  body: unknown;
}

export type Settings = Record<string, unknown>;

export type Action = (input: Record<string, unknown>, settings: Settings) => Promise<unknown>;

export interface PullContext {
  settings: Settings;
  /** Per-integration state that survives restarts. */
  state: Record<string, unknown>;
}

/** What `integrations/<name>/index.ts` exports as default. */
export interface Integration {
  /** Signal: verify the request, return signals, or null when verification fails. */
  handle?: (req: WebhookRequest, settings: Settings) => Promise<Signal[] | null> | Signal[] | null;
  /** Signal: sign a raw body the way the source would. Used by tests and `gtm webhook`. */
  sign?: (rawBody: string) => { headers?: Record<string, string>; query?: Record<string, string> };
  /** Pull: fetch what is new since the last run and return it as signals. */
  pull?: (ctx: PullContext) => Promise<Signal[]>;
  /** Tool or write: callable from skills (`gtm tool`) and from a completion. */
  actions?: Record<string, Action>;
}

export interface LoadedIntegration extends Integration {
  manifest: Manifest;
}
