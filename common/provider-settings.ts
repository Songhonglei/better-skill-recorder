export type ConfiguredAgentProvider = "copilot" | "openai-compatible";

export interface AgentModelPreset {
  id: string;
  label: string;
  /** Short mark shown in the picker; derived from the label when omitted. */
  badge?: string;
  /** Endpoint or provider on which this preset was verified. */
  source?: string;
  verified?: boolean;
  capabilities?: readonly string[];
}

/** Persisted, non-secret provider configuration. API keys never belong here. */
export interface AgentProviderConfigFile {
  version: 1;
  provider: ConfiguredAgentProvider;
  openaiCompatible: {
    baseUrl: string;
    model: string;
    vision: boolean;
    /** Global, user-editable choices rendered by the model picker. */
    modelPresets: AgentModelPreset[];
    /** Optional environment-variable indirection for hand-authored config files. */
    apiKeyEnv?: string;
  };
}

export interface AgentProviderSettings {
  provider: ConfiguredAgentProvider;
  baseUrl: string;
  model: string;
  vision: boolean;
  modelPresets: readonly AgentModelPreset[];
  hasApiKey: boolean;
  apiKeySource: "none" | "secure-storage" | "environment";
  secureStorageAvailable: boolean;
  configPath: string;
  configError?: string;
  /** Fields whose effective values currently come from process environment. */
  environmentOverrides: readonly string[];
}

export interface AgentProviderSettingsInput {
  provider: ConfiguredAgentProvider;
  baseUrl: string;
  model: string;
  vision: boolean;
  /** Omit or leave blank to preserve the securely stored key. */
  apiKey?: string;
  /** Explicitly remove the securely stored key. */
  clearApiKey?: boolean;
}

export interface AgentProviderSettingsResult {
  ok: boolean;
  settings?: AgentProviderSettings;
  error?: string;
}

export interface AgentProviderTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface AgentProviderRevealResult {
  ok: boolean;
  error?: string;
}
