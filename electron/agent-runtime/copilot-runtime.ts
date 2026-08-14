import {
  approveAll,
  CopilotClient,
  type GetAuthStatusResponse,
  type ModelInfo,
  type SessionConfig,
  type Tool,
} from "@github/copilot-sdk";

import { COPILOT_SIGNED_OUT_ERROR } from "../../common/ipc";
import { copilotConnectionOption, resolveCopilotCliPath, withStartupTimeout } from "../copilot-cli-path";
import { createLogger } from "../logger";
import { AgentRuntimeError } from "./errors";
import type {
  AgentConnectionStatus,
  AgentModelInfo,
  AgentRuntime,
  AgentSession,
  AgentSessionOptions,
  AgentTool,
} from "./types";

interface CopilotSessionPort {
  sendAndWait(prompt: string, timeout?: number): Promise<unknown>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
}

/** Minimal SDK client surface used by the adapter, kept injectable for contract tests. */
export interface CopilotClientPort {
  start(): Promise<void>;
  stop(): Promise<unknown>;
  getAuthStatus(): Promise<GetAuthStatusResponse>;
  listModels(): Promise<ModelInfo[]>;
  createSession(config: SessionConfig): Promise<CopilotSessionPort>;
}

export type CopilotClientFactory = () => CopilotClientPort;

function toCopilotTool(tool: AgentTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    handler: (input) => tool.handler(input),
    defer: "never",
  };
}

class CopilotAgentSession implements AgentSession {
  constructor(private readonly session: CopilotSessionPort) {}

  async run(prompt: string, options: { timeoutMs: number }): Promise<void> {
    await this.session.sendAndWait(prompt, options.timeoutMs);
  }

  abort(): Promise<void> {
    return this.session.abort();
  }

  dispose(): Promise<void> {
    return this.session.disconnect();
  }
}

/** Provider adapter that preserves the existing Copilot CLI/SDK behavior. */
export class CopilotAgentRuntime implements AgentRuntime {
  readonly id = "copilot" as const;
  readonly capabilities = { vision: true } as const;

  private client: CopilotClientPort | null = null;
  private clientStart: Promise<AgentConnectionStatus> | null = null;
  private readonly log;

  constructor(
    private readonly label: string,
    private readonly createClient: CopilotClientFactory = () =>
      new CopilotClient(copilotConnectionOption()),
  ) {
    this.log = createLogger(`${label}/Copilot`);
  }

  async checkConnection(signal?: AbortSignal): Promise<AgentConnectionStatus> {
    signal?.throwIfAborted();
    if (this.client && this.clientStart) return this.clientStart;
    if (this.clientStart) return this.clientStart;

    this.clientStart = (async () => {
      const client = this.createClient();
      try {
        if (resolveCopilotCliPath()) this.log.info("CLI path resolved from node_modules");
        await withStartupTimeout(client.start(), `Copilot CLI (${this.label})`);
        signal?.throwIfAborted();
        const auth = await client.getAuthStatus();
        if (!auth.isAuthenticated) {
          throw new AgentRuntimeError(COPILOT_SIGNED_OUT_ERROR, {
            code: "authentication_required",
            provider: this.id,
          });
        }
        this.client = client;
        const status: AgentConnectionStatus = {
          connected: true,
          ...(auth.login ? { login: auth.login } : {}),
        };
        this.log.info("Copilot ready", status.login ? `as ${status.login}` : "");
        return status;
      } catch (error) {
        if (this.client !== client) await client.stop().catch(() => undefined);
        throw error;
      }
    })();

    try {
      return await this.clientStart;
    } catch (error) {
      this.client = null;
      this.clientStart = null;
      throw error;
    }
  }

  async listModels(signal?: AbortSignal): Promise<AgentModelInfo[]> {
    await this.checkConnection(signal);
    signal?.throwIfAborted();
    const models = await this.requireClient().listModels();
    return models.map((model) => ({
      id: model.id,
      enabled: model.policy?.state !== "disabled",
      supportsVision: Boolean(model.capabilities?.supports?.vision),
    }));
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    await this.checkConnection();
    const tools = options.tools.map(toCopilotTool);
    const session = await this.requireClient().createSession({
      systemMessage: { mode: "append", content: options.systemInstructions },
      tools,
      onPermissionRequest: approveAll,
      ...(options.workingDirectory ? { workingDirectory: options.workingDirectory } : {}),
      enableHostGitOperations: false,
      infiniteSessions: { enabled: false },
      availableTools: tools.map((tool) => tool.name),
      ...(options.model ? { model: options.model } : {}),
    });
    return new CopilotAgentSession(session);
  }

  async dispose(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.clientStart = null;
    if (client) await client.stop().catch(() => undefined);
  }

  private requireClient(): CopilotClientPort {
    if (!this.client) throw new Error("Copilot runtime is not connected.");
    return this.client;
  }
}
