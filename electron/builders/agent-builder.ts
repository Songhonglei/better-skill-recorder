import { CopilotAgentRuntime } from "../agent-runtime/copilot-runtime";
import type {
  AgentRuntime,
  AgentSession,
  AgentSessionOptions,
} from "../agent-runtime/types";
import { createLogger } from "../logger";

/**
 * Shared provider-neutral plumbing for the final-stage multi-turn builders. Owns
 * one runtime and a small pool of live conversations — one per recording — so
 * each build's plan → refine → create flow stays in a single session.
 */

/** The minimum every live build carries so the pool can manage it. */
export interface BaseLive {
  sessionId: string;
  agent: AgentSession;
}

const MAX_LIVE_SESSIONS = 4;

export abstract class AgentBuilder<TLive extends BaseLive> {
  private runtimeReady: Promise<void> | null = null;
  protected model: string | undefined;
  protected readonly live = new Map<string, TLive>();
  protected readonly active = new Set<string>();
  protected readonly log;

  constructor(
    name: string,
    private runtime: AgentRuntime = new CopilotAgentRuntime(name),
  ) {
    this.log = createLogger(name);
  }

  isBuilding(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  isBusy(): boolean {
    return this.active.size > 0;
  }

  /** Apply a provider change without carrying old plan conversations across models. */
  async replaceRuntime(runtime: AgentRuntime): Promise<void> {
    if (this.isBusy()) {
      await runtime.dispose().catch(() => undefined);
      throw new Error("Wait for the current build to finish before changing models.");
    }
    const previous = this.runtime;
    for (const [id] of this.live) await this.disposeLive(id);
    this.runtime = runtime;
    this.runtimeReady = null;
    this.model = undefined;
    await previous.dispose().catch(() => undefined);
  }

  async cancel(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (live) await live.agent.abort().catch(() => undefined);
  }

  async forget(sessionId: string): Promise<void> {
    await this.disposeLive(sessionId);
  }

  async evictIdle(): Promise<void> {
    for (const [id, live] of this.live) {
      if (this.active.has(id)) continue;
      this.live.delete(id);
      await live.agent.dispose().catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    for (const [id] of this.live) await this.disposeLive(id);
    await this.runtime.dispose().catch(() => undefined);
    this.runtimeReady = null;
  }

  /** Create a stateful conversation through the configured provider runtime. */
  protected async createAgentSession(options: AgentSessionOptions): Promise<AgentSession> {
    await this.ensureRuntime();
    return this.runtime.createSession({
      ...options,
      ...(this.model ? { model: this.model } : {}),
    });
  }

  /** Add a freshly created live session to the pool, evicting the oldest idle one
   *  when the pool is over budget. */
  protected registerLive(live: TLive): void {
    this.live.set(live.sessionId, live);
    for (const [id, candidate] of this.live) {
      if (this.live.size <= MAX_LIVE_SESSIONS) break;
      if (id === live.sessionId || this.active.has(id)) continue;
      this.live.delete(id);
      void candidate.agent.dispose().catch(() => undefined);
    }
  }

  protected async disposeLive(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live) return;
    this.live.delete(sessionId);
    await live.agent.dispose().catch(() => undefined);
  }

  private async ensureRuntime(): Promise<void> {
    if (this.runtimeReady) return this.runtimeReady;
    this.runtimeReady = (async () => {
      const status = await this.runtime.checkConnection();
      this.model = this.runtime.id === "copilot"
        ? process.env.SKILL_RECORDER_MODEL || undefined
        : (await this.runtime.listModels?.())?.find((candidate) => candidate.enabled)?.id;
      this.log.info(
        `${this.runtime.id} ready`,
        status.login ? `as ${status.login}` : "",
        this.model ? `· model ${this.model}` : "",
      );
    })();
    try {
      await this.runtimeReady;
    } catch (error) {
      this.runtimeReady = null;
      throw error;
    }
  }
}
