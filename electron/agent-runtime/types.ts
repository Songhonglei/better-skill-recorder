/** Provider-neutral JSON Schema accepted by every agent runtime. */
export type AgentJsonSchema = Record<string, unknown>;

export type AgentProviderId = "copilot" | "openai-compatible";

export type AgentToolResultType = "success" | "failure" | "rejected" | "denied" | "timeout";

export interface AgentToolBinaryResult {
  data: string;
  mimeType: string;
  type: "image" | "resource";
  description?: string;
}

export interface AgentToolResultObject {
  textResultForLlm: string;
  binaryResultsForLlm?: AgentToolBinaryResult[];
  resultType: AgentToolResultType;
  error?: string;
}

export type AgentToolResult = string | AgentToolResultObject;

/** A custom tool exposed to exactly one model workflow. */
export interface AgentTool {
  name: string;
  description: string;
  parameters: AgentJsonSchema;
  handler(input: unknown): AgentToolResult | Promise<AgentToolResult>;
}

export interface AgentConnectionStatus {
  connected: true;
  login?: string;
}

export interface AgentModelInfo {
  id: string;
  enabled: boolean;
  supportsVision: boolean;
}

export interface AgentSessionOptions {
  systemInstructions: string;
  tools: AgentTool[];
  workingDirectory?: string;
  model?: string;
}

export interface AgentRunOptions {
  timeoutMs: number;
}

/** One provider-owned, stateful conversation. */
export interface AgentSession {
  run(prompt: string, options: AgentRunOptions): Promise<void>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

/** The only provider surface business workflows are allowed to depend on. */
export interface AgentRuntime {
  readonly id: AgentProviderId;
  checkConnection(signal?: AbortSignal): Promise<AgentConnectionStatus>;
  listModels?(signal?: AbortSignal): Promise<AgentModelInfo[]>;
  createSession(options: AgentSessionOptions): Promise<AgentSession>;
  dispose(): Promise<void>;
}
