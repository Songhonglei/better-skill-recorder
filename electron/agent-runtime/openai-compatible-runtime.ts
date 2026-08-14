import { AgentRuntimeError } from "./errors";
import type {
  AgentConnectionStatus,
  AgentModelInfo,
  AgentRuntime,
  AgentSession,
  AgentSessionOptions,
  AgentTool,
  AgentToolResult,
} from "./types";

const DEFAULT_MAX_TURNS = 16;
const DEFAULT_MAX_TOOL_CALLS = 8;
const DEFAULT_REPAIR_ATTEMPTS = 2;
const MAX_IMAGES_PER_TOOL_RESULT = 8;
const MAX_IMAGE_BASE64_CHARS = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BASE64_CHARS = 24 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface OpenAICompatibleRuntimeConfig {
  /** API root such as https://example.com/v1 or http://127.0.0.1:1234/v1. */
  baseUrl: string;
  /** Held only by the runtime. Empty is allowed for local endpoints without auth. */
  apiKey?: string;
  model: string;
  /** Explicit opt-in; false unless the configured model is known to accept images. */
  supportsVision?: boolean;
  maxTurns?: number;
  maxToolCallsPerTurn?: number;
  maxRepairAttempts?: number;
}

export type AgentFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type ChatUserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "auto" } };

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatUserContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ActiveRun {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  timedOut: boolean;
}

function runtimeError(
  message: string,
  code: ConstructorParameters<typeof AgentRuntimeError>[1]["code"],
  options: { retryable?: boolean; cause?: unknown } = {},
): AgentRuntimeError {
  return new AgentRuntimeError(message, {
    code,
    provider: "openai-compatible",
    ...options,
  });
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function chatCompletionsUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw runtimeError("OpenAI-compatible base URL is invalid.", "invalid_configuration");
  }
  if (url.username || url.password) {
    throw runtimeError(
      "OpenAI-compatible base URL must not contain credentials.",
      "invalid_configuration",
    );
  }
  if (url.search || url.hash) {
    throw runtimeError(
      "OpenAI-compatible base URL must not contain a query or fragment.",
      "invalid_configuration",
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw runtimeError(
      "OpenAI-compatible remote endpoints must use HTTPS; HTTP is allowed only on loopback.",
      "invalid_configuration",
    );
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions")
    ? path
    : `${path}/chat/completions`.replace(/^\/{2,}/, "/");
  return url;
}

function parseToolCall(raw: unknown, index: number): ChatToolCall {
  if (!raw || typeof raw !== "object") {
    throw runtimeError(`Provider returned an invalid tool call at index ${index}.`, "provider_error");
  }
  const record = raw as Record<string, unknown>;
  const fn = record.function;
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    record.type !== "function" ||
    !fn ||
    typeof fn !== "object" ||
    typeof (fn as Record<string, unknown>).name !== "string" ||
    ((fn as Record<string, unknown>).name as string).length === 0 ||
    typeof (fn as Record<string, unknown>).arguments !== "string"
  ) {
    throw runtimeError(`Provider returned an invalid tool call at index ${index}.`, "provider_error");
  }
  return {
    id: record.id,
    type: "function",
    function: {
      name: (fn as Record<string, unknown>).name as string,
      arguments: (fn as Record<string, unknown>).arguments as string,
    },
  };
}

function parseAssistantMessage(payload: unknown): Extract<ChatMessage, { role: "assistant" }> {
  if (!payload || typeof payload !== "object") {
    throw runtimeError("Provider returned an invalid Chat Completions response.", "provider_error");
  }
  const choices = (payload as Record<string, unknown>).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = first && typeof first === "object"
    ? (first as Record<string, unknown>).message
    : undefined;
  if (!message || typeof message !== "object") {
    throw runtimeError("Provider returned no assistant message.", "provider_error");
  }
  const record = message as Record<string, unknown>;
  const content = record.content;
  if (content !== null && content !== undefined && typeof content !== "string") {
    throw runtimeError("Provider returned unsupported assistant content.", "provider_error");
  }
  const rawCalls = record.tool_calls;
  const toolCalls = rawCalls === undefined
    ? undefined
    : Array.isArray(rawCalls)
      ? rawCalls.map(parseToolCall)
      : (() => {
          throw runtimeError("Provider returned invalid tool calls.", "provider_error");
        })();
  return {
    role: "assistant",
    content: typeof content === "string" ? content : null,
    ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
  };
}

function toolResultContent(result: AgentToolResult, supportsVision: boolean): {
  content: string;
  success: boolean;
  images: ChatUserContentPart[];
} {
  if (typeof result === "string") return { content: result, success: true, images: [] };
  const binary = result.binaryResultsForLlm ?? [];
  if (binary.length && !supportsVision) {
    throw runtimeError(
      "The configured OpenAI-compatible model is not enabled for image tool results.",
      "tool_failed",
    );
  }
  if (binary.length > MAX_IMAGES_PER_TOOL_RESULT) {
    throw runtimeError(
      `A tool returned too many images (maximum ${MAX_IMAGES_PER_TOOL_RESULT}).`,
      "tool_failed",
    );
  }
  if (binary.reduce((total, item) => total + item.data.length, 0) > MAX_TOTAL_IMAGE_BASE64_CHARS) {
    throw runtimeError("A tool returned an oversized image payload.", "tool_failed");
  }
  const images = binary.map((item) => {
    if (
      item.type !== "image" ||
      !SUPPORTED_IMAGE_TYPES.has(item.mimeType) ||
      !item.data ||
      item.data.length > MAX_IMAGE_BASE64_CHARS
    ) {
      throw runtimeError("A tool returned an unsupported or oversized image.", "tool_failed");
    }
    return {
      type: "image_url" as const,
      image_url: {
        url: `data:${item.mimeType};base64,${item.data}`,
        detail: "auto" as const,
      },
    };
  });
  return {
    content: result.textResultForLlm,
    success: result.resultType === "success",
    images,
  };
}

class OpenAICompatibleSession implements AgentSession {
  private readonly history: ChatMessage[];
  private readonly toolsByName: Map<string, AgentTool>;
  private active: ActiveRun | null = null;
  private disposed = false;

  constructor(
    private readonly endpoint: URL,
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly tools: AgentTool[],
    private readonly supportsVision: boolean,
    systemInstructions: string,
    private readonly fetcher: AgentFetch,
    private readonly limits: {
      maxTurns: number;
      maxToolCallsPerTurn: number;
      maxRepairAttempts: number;
    },
    private readonly onDispose: () => void,
  ) {
    this.history = [{ role: "system", content: systemInstructions }];
    this.toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    if (this.toolsByName.size !== tools.length) {
      throw runtimeError("Agent tool names must be unique.", "invalid_configuration");
    }
  }

  async run(prompt: string, options: { timeoutMs: number }): Promise<void> {
    if (this.disposed) throw runtimeError("Agent session has been disposed.", "session_failed");
    if (this.active) throw runtimeError("Agent session is already running.", "session_failed");
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw runtimeError("Agent run timeout must be positive.", "invalid_configuration");
    }

    const controller = new AbortController();
    const active: ActiveRun = {
      controller,
      timedOut: false,
      timeout: setTimeout(() => {
        active.timedOut = true;
        controller.abort();
      }, options.timeoutMs),
    };
    this.active = active;
    const historyCheckpoint = this.history.length;
    this.history.push({ role: "user", content: prompt });

    try {
      await this.runLoop(active);
    } catch (error) {
      if (!this.disposed) this.history.length = historyCheckpoint;
      if (active.controller.signal.aborted) {
        throw runtimeError(
          active.timedOut ? "OpenAI-compatible agent run timed out." : "OpenAI-compatible agent run was cancelled.",
          active.timedOut ? "timeout" : "aborted",
          { retryable: active.timedOut, cause: error },
        );
      }
      if (error instanceof AgentRuntimeError) throw error;
      throw runtimeError("OpenAI-compatible agent session failed.", "session_failed", {
        cause: error,
      });
    } finally {
      clearTimeout(active.timeout);
      if (this.active === active) this.active = null;
    }
  }

  async abort(): Promise<void> {
    this.active?.controller.abort();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.active?.controller.abort();
    this.history.length = 0;
    this.onDispose();
  }

  private async runLoop(active: ActiveRun): Promise<void> {
    let repairFailures = 0;
    for (let turn = 0; turn < this.limits.maxTurns; turn += 1) {
      active.controller.signal.throwIfAborted();
      const assistant = await this.request(active.controller.signal);
      this.history.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (calls.length === 0) return;
      if (calls.length > this.limits.maxToolCallsPerTurn) {
        throw runtimeError(
          `Provider requested too many tools in one turn (maximum ${this.limits.maxToolCallsPerTurn}).`,
          "tool_failed",
        );
      }

      // The compatible runtime deliberately serializes tool execution for deterministic ordering.
      const imageParts: ChatUserContentPart[] = [];
      for (const call of calls) {
        active.controller.signal.throwIfAborted();
        const tool = this.toolsByName.get(call.function.name);
        if (!tool) {
          const safeName = call.function.name.slice(0, 128);
          throw runtimeError(
            `Provider requested a tool that is not allowed: ${safeName}.`,
            "tool_failed",
          );
        }

        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          repairFailures += 1;
          this.assertRepairBudget(repairFailures);
          this.history.push({
            role: "tool",
            tool_call_id: call.id,
            content: "Tool arguments were not valid JSON. Return corrected JSON arguments and try again.",
          });
          continue;
        }

        let converted: { content: string; success: boolean; images: ChatUserContentPart[] };
        try {
          converted = toolResultContent(await tool.handler(args), this.supportsVision);
        } catch (error) {
          if (error instanceof AgentRuntimeError) throw error;
          converted = {
            content: "Tool execution failed. Correct the arguments and try again.",
            success: false,
            images: [],
          };
        }
        active.controller.signal.throwIfAborted();
        if (!converted.success) {
          repairFailures += 1;
          this.assertRepairBudget(repairFailures);
        }
        this.history.push({
          role: "tool",
          tool_call_id: call.id,
          content: converted.content,
        });
        if (converted.success && tool.completesRun) return;
        if (converted.images.length) {
          imageParts.push(
            {
              type: "text",
              text: `Images returned by tool ${tool.name} for call ${call.id}:`,
            },
            ...converted.images,
          );
        }
      }
      // Chat Completions does not portably accept image parts on a `tool` role.
      // Pair every call with its text tool result first, then add one user message
      // containing the inline images before the next assistant turn.
      if (imageParts.length) this.history.push({ role: "user", content: imageParts });
    }
    throw runtimeError(
      `OpenAI-compatible agent exceeded ${this.limits.maxTurns} model turns.`,
      "session_failed",
    );
  }

  private assertRepairBudget(failures: number): void {
    if (failures > this.limits.maxRepairAttempts) {
      throw runtimeError(
        `Tool calls remained invalid after ${this.limits.maxRepairAttempts} repair attempts.`,
        "tool_failed",
      );
    }
  }

  private async request(signal: AbortSignal): Promise<Extract<ChatMessage, { role: "assistant" }>> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.history,
          tools: this.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: "auto",
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw runtimeError("Could not connect to the OpenAI-compatible endpoint.", "connection_failed", {
        retryable: true,
        cause: error,
      });
    }

    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "authentication_required"
        : response.status === 429
          ? "rate_limited"
          : "provider_error";
      throw runtimeError(`OpenAI-compatible endpoint returned HTTP ${response.status}.`, code, {
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw runtimeError("Provider returned invalid JSON.", "provider_error", { cause: error });
    }
    return parseAssistantMessage(payload);
  }
}

/** OpenAI-compatible Chat Completions adapter shared by Analyze and both builders. */
export class OpenAICompatibleRuntime implements AgentRuntime {
  readonly id = "openai-compatible" as const;
  readonly capabilities: { readonly vision: boolean };
  private readonly sessions = new Set<OpenAICompatibleSession>();

  constructor(
    private readonly config: OpenAICompatibleRuntimeConfig,
    private readonly fetcher: AgentFetch = globalThis.fetch.bind(globalThis),
  ) {
    this.capabilities = { vision: config.supportsVision === true };
  }

  async checkConnection(signal?: AbortSignal): Promise<AgentConnectionStatus> {
    signal?.throwIfAborted();
    this.validateConfig();
    return { connected: true };
  }

  async listModels(signal?: AbortSignal): Promise<AgentModelInfo[]> {
    await this.checkConnection(signal);
    return [{
      id: this.config.model.trim(),
      enabled: true,
      supportsVision: this.capabilities.vision,
    }];
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    await this.checkConnection();
    const endpoint = chatCompletionsUrl(this.config.baseUrl);
    const session = new OpenAICompatibleSession(
      endpoint,
      this.config.apiKey,
      options.model?.trim() || this.config.model.trim(),
      [...options.tools],
      this.capabilities.vision,
      options.systemInstructions,
      this.fetcher,
      {
        maxTurns: positiveInteger(this.config.maxTurns, DEFAULT_MAX_TURNS),
        maxToolCallsPerTurn: positiveInteger(
          this.config.maxToolCallsPerTurn,
          DEFAULT_MAX_TOOL_CALLS,
        ),
        maxRepairAttempts: positiveInteger(
          this.config.maxRepairAttempts,
          DEFAULT_REPAIR_ATTEMPTS,
        ),
      },
      () => this.sessions.delete(session),
    );
    this.sessions.add(session);
    return session;
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.sessions].map((session) => session.dispose()));
    this.sessions.clear();
  }

  private validateConfig(): void {
    chatCompletionsUrl(this.config.baseUrl);
    if (!this.config.model?.trim()) {
      throw runtimeError("OpenAI-compatible model is required.", "invalid_configuration");
    }
  }
}
