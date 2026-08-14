import { CopilotAgentRuntime } from "./copilot-runtime";
import { OpenAICompatibleRuntime } from "./openai-compatible-runtime";
import type { AgentRuntime } from "./types";

export const OPENAI_COMPATIBLE_ENV = {
  provider: "SKILL_RECORDER_AGENT_PROVIDER",
  baseUrl: "SKILL_RECORDER_OPENAI_BASE_URL",
  apiKey: "SKILL_RECORDER_OPENAI_API_KEY",
  model: "SKILL_RECORDER_MODEL",
  vision: "SKILL_RECORDER_OPENAI_VISION",
} as const;

export interface AgentRuntimeFactory {
  readonly provider: AgentRuntime["id"];
  create(label: string): AgentRuntime;
}

export type AgentRuntimeConfiguration =
  | { readonly provider: "copilot" }
  | {
      readonly provider: "openai-compatible";
      readonly baseUrl: string;
      readonly apiKey?: string;
      readonly model: string;
      readonly supportsVision: boolean;
    };

function visionEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return true;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  throw new Error(`${OPENAI_COMPATIBLE_ENV.vision} must be true or false.`);
}

/**
 * Process-only compatibility bridge. The API key is read once into this in-memory
 * factory and removed from the process environment. The app's normal path uses
 * AgentSettingsStore + createAgentRuntimeFactoryFromConfig; tests and scripted launches
 * keep using this helper.
 */
export function createAgentRuntimeFactory(
  env: NodeJS.ProcessEnv = process.env,
): AgentRuntimeFactory {
  const provider = env[OPENAI_COMPATIBLE_ENV.provider]?.trim();
  if (!provider || provider === "copilot") {
    return {
      provider: "copilot",
      create: (label) => new CopilotAgentRuntime(label),
    };
  }
  if (provider !== "openai-compatible") {
    throw new Error(
      `${OPENAI_COMPATIBLE_ENV.provider} must be "copilot" or "openai-compatible".`,
    );
  }

  const apiKey = env[OPENAI_COMPATIBLE_ENV.apiKey];
  // Only mutate the real process environment, never a caller-owned test/config object.
  if (env === process.env) delete process.env[OPENAI_COMPATIBLE_ENV.apiKey];
  const config = {
    baseUrl: env[OPENAI_COMPATIBLE_ENV.baseUrl] ?? "",
    ...(apiKey ? { apiKey } : {}),
    model: env[OPENAI_COMPATIBLE_ENV.model] ?? "",
    supportsVision: visionEnabled(env[OPENAI_COMPATIBLE_ENV.vision]),
  };
  return createAgentRuntimeFactoryFromConfig({
    provider: "openai-compatible",
    ...config,
  });
}

/** Build a runtime factory from persisted/UI settings rather than process state. */
export function createAgentRuntimeFactoryFromConfig(
  config: AgentRuntimeConfiguration,
): AgentRuntimeFactory {
  if (config.provider === "copilot") {
    return {
      provider: "copilot",
      create: (label) => new CopilotAgentRuntime(label),
    };
  }
  return {
    provider: "openai-compatible",
    create: () => new OpenAICompatibleRuntime(config),
  };
}

/** Backwards-compatible convenience used by focused Analyze tests and callers. */
export function createAnalyzeRuntime(
  label: string,
  env: NodeJS.ProcessEnv = process.env,
): AgentRuntime {
  return createAgentRuntimeFactory(env).create(label);
}
