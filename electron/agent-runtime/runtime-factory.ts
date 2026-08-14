import { CopilotAgentRuntime } from "./copilot-runtime";
import { OpenAICompatibleRuntime } from "./openai-compatible-runtime";
import type { AgentRuntime } from "./types";

export const OPENAI_COMPATIBLE_ENV = {
  provider: "SKILL_RECORDER_AGENT_PROVIDER",
  baseUrl: "SKILL_RECORDER_OPENAI_BASE_URL",
  apiKey: "SKILL_RECORDER_OPENAI_API_KEY",
  model: "SKILL_RECORDER_MODEL",
} as const;

/**
 * Phase 2 configuration bridge. The API key is read once into the runtime and
 * removed from the process environment, so it is never persisted by the app.
 * Phase 4 replaces this with Settings + OS credential storage.
 */
export function createAnalyzeRuntime(
  label: string,
  env: NodeJS.ProcessEnv = process.env,
): AgentRuntime {
  const provider = env[OPENAI_COMPATIBLE_ENV.provider]?.trim();
  if (!provider || provider === "copilot") return new CopilotAgentRuntime(label);
  if (provider !== "openai-compatible") {
    throw new Error(
      `${OPENAI_COMPATIBLE_ENV.provider} must be "copilot" or "openai-compatible".`,
    );
  }

  const apiKey = env[OPENAI_COMPATIBLE_ENV.apiKey];
  // Only mutate the real process environment, never a caller-owned test/config object.
  if (env === process.env) delete process.env[OPENAI_COMPATIBLE_ENV.apiKey];
  return new OpenAICompatibleRuntime({
    baseUrl: env[OPENAI_COMPATIBLE_ENV.baseUrl] ?? "",
    ...(apiKey ? { apiKey } : {}),
    model: env[OPENAI_COMPATIBLE_ENV.model] ?? "",
  });
}
