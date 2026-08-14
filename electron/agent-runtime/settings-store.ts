import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";
import defaultModelPresetsJson from "../../common/model-presets.defaults.json" with { type: "json" };

import type {
  AgentModelPreset,
  AgentProviderConfigFile,
  AgentProviderSettings,
  AgentProviderSettingsInput,
} from "../../common/provider-settings";
import { chatCompletionsUrl } from "./openai-compatible-runtime";
import {
  OPENAI_COMPATIBLE_ENV,
  type AgentRuntimeConfiguration,
} from "./runtime-factory";

const MAX_CONFIG_BYTES = 64 * 1024;
const SECRET_VERSION = 1;

const ModelPresetSchema = z.object({
  id: z.string().trim().min(1).max(256),
  label: z.string().trim().min(1).max(128),
  badge: z.string().trim().min(1).max(3).optional(),
  source: z.string().trim().min(1).max(128).optional(),
  verified: z.boolean().optional(),
  capabilities: z.array(z.string().trim().min(1).max(64)).max(16).optional(),
}).strict();

const DEFAULT_MODEL_PRESETS = z.array(ModelPresetSchema).max(100).parse(
  defaultModelPresetsJson,
) as AgentModelPreset[];

const ConfigSchema = z.object({
  version: z.literal(1),
  provider: z.enum(["copilot", "openai-compatible"]),
  openaiCompatible: z.object({
    baseUrl: z.string().max(2048),
    model: z.string().max(256),
    vision: z.boolean(),
    // Optional only for backward compatibility; reload migrates old files.
    modelPresets: z.array(ModelPresetSchema).max(100).optional(),
    apiKeyEnv: z.string().trim().min(1).max(128).optional(),
  }).strict(),
}).strict();

const SecretSchema = z.object({
  version: z.literal(SECRET_VERSION),
  apiKey: z.string().min(1),
}).strict();

const DEFAULT_CONFIG: AgentProviderConfigFile = {
  version: 1,
  provider: "copilot",
  openaiCompatible: {
    baseUrl: "",
    model: "",
    vision: true,
    modelPresets: DEFAULT_MODEL_PRESETS,
  },
};

export interface SecretCodec {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export interface SafeStorageAvailability {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?: () => string;
}

/**
 * Electron exposes getSelectedStorageBackend only on Linux at runtime. Treat
 * Linux's basic_text fallback as unavailable, while macOS and Windows rely on
 * their native credential stores without calling the Linux-only method.
 */
export function safeStorageIsUsable(
  storage: SafeStorageAvailability,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!storage.isEncryptionAvailable()) return false;
  if (platform !== "linux") return true;
  return typeof storage.getSelectedStorageBackend === "function" &&
    storage.getSelectedStorageBackend() !== "basic_text";
}

export interface AgentSettingsStoreOptions {
  configPath: string;
  secretPath: string;
  codec: SecretCodec;
  /** Known platform capability, used to avoid probing native credentials at startup. */
  secureStorageAvailable?: boolean;
  env?: NodeJS.ProcessEnv;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function atomicWrite(file: string, value: string): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temporary = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, value, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, file);
    try {
      chmodSync(file, 0o600);
    } catch {
      // Windows does not implement POSIX modes; encrypted content is still protected.
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function parseVision(raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  throw new Error(`${OPENAI_COMPATIBLE_ENV.vision} must be true or false.`);
}

function validateInput(
  input: AgentProviderSettingsInput,
  modelPresets: AgentModelPreset[],
): AgentProviderConfigFile {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.baseUrl !== "string" ||
    typeof input.model !== "string" ||
    typeof input.vision !== "boolean" ||
    (input.apiKey !== undefined && typeof input.apiKey !== "string") ||
    (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean")
  ) {
    throw new Error("Invalid model settings payload.");
  }
  if (input.apiKey && input.apiKey.length > 16 * 1024) {
    throw new Error("API key is too large.");
  }
  if (input.provider !== "copilot" && input.provider !== "openai-compatible") {
    throw new Error("Choose GitHub Copilot or an OpenAI-compatible provider.");
  }
  const config: AgentProviderConfigFile = {
    version: 1,
    provider: input.provider,
    openaiCompatible: {
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      vision: input.vision,
      modelPresets,
    },
  };
  if (config.provider === "openai-compatible") {
    chatCompletionsUrl(config.openaiCompatible.baseUrl);
    if (!config.openaiCompatible.model) throw new Error("Model name is required.");
  }
  return config;
}

/**
 * Owns the user-editable provider file and the separately encrypted API key.
 * Environment variables remain the highest-priority, process-only escape hatch.
 */
export class AgentSettingsStore {
  private fileConfig: AgentProviderConfigFile = DEFAULT_CONFIG;
  private configError: string | undefined;
  private readonly env: NodeJS.ProcessEnv;
  private readonly environmentApiKey: string | undefined;

  constructor(private readonly options: AgentSettingsStoreOptions) {
    this.env = options.env ?? process.env;
    this.environmentApiKey = this.env[OPENAI_COMPATIBLE_ENV.apiKey];
    if (this.env === process.env) delete process.env[OPENAI_COMPATIBLE_ENV.apiKey];
    this.reload();
  }

  reload(): AgentProviderSettings {
    this.configError = undefined;
    if (!existsSync(this.options.configPath)) {
      this.fileConfig = DEFAULT_CONFIG;
      atomicWrite(this.options.configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
      return this.snapshot();
    }
    const previous = this.fileConfig;
    try {
      const raw = readFileSync(this.options.configPath, "utf8");
      if (Buffer.byteLength(raw) > MAX_CONFIG_BYTES) {
        throw new Error("Provider configuration is too large.");
      }
      const parsed = ConfigSchema.parse(JSON.parse(raw));
      const needsPresetMigration = parsed.openaiCompatible.modelPresets === undefined;
      this.fileConfig = {
        ...parsed,
        openaiCompatible: {
          ...parsed.openaiCompatible,
          modelPresets: parsed.openaiCompatible.modelPresets ?? DEFAULT_MODEL_PRESETS,
        },
      };
      if (needsPresetMigration) {
        atomicWrite(this.options.configPath, `${JSON.stringify(this.fileConfig, null, 2)}\n`);
      }
    } catch (error) {
      this.fileConfig = previous;
      this.configError = `Could not read provider configuration: ${message(error)}`;
    }
    return this.snapshot();
  }

  snapshot(): AgentProviderSettings {
    const effective = this.effectiveValues();
    const referencedKey = this.fileConfig.openaiCompatible.apiKeyEnv
      ? this.env[this.fileConfig.openaiCompatible.apiKeyEnv]
      : undefined;
    const hasEnvironmentKey = Boolean(this.environmentApiKey || referencedKey);
    // Do not touch Keychain/credential storage when an environment key already
    // wins. Besides being unnecessary, a newly signed local build may trigger a
    // blocking OS authorization prompt before the first application window exists.
    const secureKey = hasEnvironmentKey ? undefined : this.readSecureApiKey();
    return {
      provider: effective.provider,
      baseUrl: effective.baseUrl,
      model: effective.model,
      vision: effective.vision,
      modelPresets: this.fileConfig.openaiCompatible.modelPresets,
      hasApiKey: Boolean(hasEnvironmentKey || secureKey),
      apiKeySource: hasEnvironmentKey
        ? "environment"
        : secureKey
          ? "secure-storage"
          : "none",
      secureStorageAvailable:
        this.options.secureStorageAvailable ?? this.options.codec.available(),
      configPath: this.options.configPath,
      ...(this.configError ? { configError: this.configError } : {}),
      environmentOverrides: this.environmentOverrides(),
    };
  }

  runtimeConfiguration(): AgentRuntimeConfiguration {
    const effective = this.effectiveValues();
    if (effective.provider === "copilot") return { provider: "copilot" };
    const referencedKey = this.fileConfig.openaiCompatible.apiKeyEnv
      ? this.env[this.fileConfig.openaiCompatible.apiKeyEnv]
      : undefined;
    const apiKey = this.environmentApiKey || referencedKey || this.readSecureApiKey();
    return {
      provider: "openai-compatible",
      baseUrl: effective.baseUrl,
      model: effective.model,
      supportsVision: effective.vision,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  preview(input: AgentProviderSettingsInput): AgentRuntimeConfiguration {
    const config = validateInput(input, this.fileConfig.openaiCompatible.modelPresets);
    if (config.provider === "copilot") return { provider: "copilot" };
    const typedKey = input.apiKey?.trim();
    const existingKey = input.clearApiKey ? undefined : this.runtimeApiKey();
    return {
      provider: "openai-compatible",
      baseUrl: config.openaiCompatible.baseUrl,
      model: config.openaiCompatible.model,
      supportsVision: config.openaiCompatible.vision,
      ...(typedKey || existingKey ? { apiKey: typedKey || existingKey } : {}),
    };
  }

  save(input: AgentProviderSettingsInput): AgentProviderSettings {
    const config = validateInput(input, this.fileConfig.openaiCompatible.modelPresets);
    const apiKeyEnv = this.fileConfig.openaiCompatible.apiKeyEnv;
    if (apiKeyEnv) config.openaiCompatible.apiKeyEnv = apiKeyEnv;
    const typedKey = input.apiKey?.trim();
    if (typedKey) this.writeSecureApiKey(typedKey);
    else if (input.clearApiKey) this.deleteSecureApiKey();
    atomicWrite(this.options.configPath, `${JSON.stringify(config, null, 2)}\n`);
    this.fileConfig = config;
    this.configError = undefined;
    return this.snapshot();
  }

  private effectiveValues(): {
    provider: "copilot" | "openai-compatible";
    baseUrl: string;
    model: string;
    vision: boolean;
  } {
    const envProvider = this.env[OPENAI_COMPATIBLE_ENV.provider]?.trim();
    if (envProvider && envProvider !== "copilot" && envProvider !== "openai-compatible") {
      throw new Error(`${OPENAI_COMPATIBLE_ENV.provider} must be "copilot" or "openai-compatible".`);
    }
    const provider = envProvider === "copilot" || envProvider === "openai-compatible"
      ? envProvider
      : this.fileConfig.provider;
    return {
      provider,
      baseUrl:
        this.env[OPENAI_COMPATIBLE_ENV.baseUrl]?.trim() ||
        this.fileConfig.openaiCompatible.baseUrl,
      model:
        this.env[OPENAI_COMPATIBLE_ENV.model]?.trim() ||
        this.fileConfig.openaiCompatible.model,
      vision: parseVision(
        this.env[OPENAI_COMPATIBLE_ENV.vision],
        this.fileConfig.openaiCompatible.vision,
      ),
    };
  }

  private environmentOverrides(): string[] {
    const fields: string[] = [];
    if (this.env[OPENAI_COMPATIBLE_ENV.provider]?.trim()) fields.push("provider");
    if (this.env[OPENAI_COMPATIBLE_ENV.baseUrl]?.trim()) fields.push("baseUrl");
    if (this.env[OPENAI_COMPATIBLE_ENV.model]?.trim()) fields.push("model");
    if (this.env[OPENAI_COMPATIBLE_ENV.vision]?.trim()) fields.push("vision");
    const referencedKey = this.fileConfig.openaiCompatible.apiKeyEnv
      ? this.env[this.fileConfig.openaiCompatible.apiKeyEnv]
      : undefined;
    if (this.environmentApiKey || referencedKey) fields.push("apiKey");
    return fields;
  }

  private runtimeApiKey(): string | undefined {
    const referencedKey = this.fileConfig.openaiCompatible.apiKeyEnv
      ? this.env[this.fileConfig.openaiCompatible.apiKeyEnv]
      : undefined;
    return this.environmentApiKey || referencedKey || this.readSecureApiKey();
  }

  private readSecureApiKey(): string | undefined {
    // File existence is cheap and avoids waking the native credential service
    // when the user has never stored a key.
    if (!existsSync(this.options.secretPath) || !this.options.codec.available()) return undefined;
    try {
      const parsed = SecretSchema.parse(
        JSON.parse(readFileSync(this.options.secretPath, "utf8")),
      );
      return this.options.codec.decrypt(Buffer.from(parsed.apiKey, "base64"));
    } catch {
      return undefined;
    }
  }

  private writeSecureApiKey(apiKey: string): void {
    if (!this.options.codec.available()) {
      throw new Error(
        "Secure credential storage is unavailable. Use SKILL_RECORDER_OPENAI_API_KEY instead.",
      );
    }
    const encrypted = this.options.codec.encrypt(apiKey).toString("base64");
    atomicWrite(
      this.options.secretPath,
      `${JSON.stringify({ version: SECRET_VERSION, apiKey: encrypted }, null, 2)}\n`,
    );
  }

  private deleteSecureApiKey(): void {
    if (existsSync(this.options.secretPath)) unlinkSync(this.options.secretPath);
  }
}
