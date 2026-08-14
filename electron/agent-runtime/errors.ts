import type { AgentProviderId } from "./types";

/** Stable categories that UI and diagnostics can handle without parsing messages. */
export type AgentRuntimeErrorCode =
  | "aborted"
  | "authentication_required"
  | "connection_failed"
  | "invalid_configuration"
  | "model_unavailable"
  | "provider_error"
  | "rate_limited"
  | "session_failed"
  | "timeout"
  | "tool_failed";

export interface AgentRuntimeErrorOptions {
  code: AgentRuntimeErrorCode;
  provider: AgentProviderId;
  retryable?: boolean;
  cause?: unknown;
}

/** Provider-neutral error with a user-facing message and machine-readable metadata. */
export class AgentRuntimeError extends Error {
  readonly code: AgentRuntimeErrorCode;
  readonly provider: AgentProviderId;
  readonly retryable: boolean;

  constructor(message: string, options: AgentRuntimeErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AgentRuntimeError";
    this.code = options.code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
  }
}
