import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OPENAI_COMPATIBLE_ENV } from "./runtime-factory";
import {
  AgentSettingsStore,
  safeStorageIsUsable,
  type SecretCodec,
} from "./settings-store";

const testCodec: SecretCodec = {
  available: () => true,
  encrypt: (value) => Buffer.from(`sealed:${value}`, "utf8"),
  decrypt: (value) => value.toString("utf8").replace(/^sealed:/, ""),
};

function fixture(env: NodeJS.ProcessEnv = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-settings-"));
  const store = new AgentSettingsStore({
    configPath: path.join(root, "agent-provider.json"),
    secretPath: path.join(root, "agent-provider.secrets.json"),
    codec: testCodec,
    env,
  });
  return { root, store };
}

test("native secure storage availability is platform aware", () => {
  const nativeStore = { isEncryptionAvailable: () => true };
  assert.equal(safeStorageIsUsable(nativeStore, "darwin"), true);
  assert.equal(safeStorageIsUsable(nativeStore, "win32"), true);
  assert.equal(safeStorageIsUsable(nativeStore, "linux"), false);
  assert.equal(
    safeStorageIsUsable({
      ...nativeStore,
      getSelectedStorageBackend: () => "basic_text",
    }, "linux"),
    false,
  );
  assert.equal(
    safeStorageIsUsable({
      ...nativeStore,
      getSelectedStorageBackend: () => "kwallet6",
    }, "linux"),
    true,
  );
  assert.equal(
    safeStorageIsUsable({ isEncryptionAvailable: () => false }, "darwin"),
    false,
  );
});

test("provider settings persist non-secrets and keep the API key encrypted", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(store.snapshot().provider, "openai-compatible");
  assert.equal(store.snapshot().configured, false);
  assert.deepEqual(
    store.snapshot().modelPresets.map((preset) => preset.id),
    ["qwen3.7-plus", "qwen3.8-max", "kimi-k2.5", "kimi-k2.6"],
  );
  const qwen37 = store.snapshot().modelPresets.find((preset) => preset.id === "qwen3.7-plus");
  assert.equal(qwen37?.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(qwen37?.tokenPlanBaseUrl, "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
  const saved = store.save({
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1/",
    model: "vision-model",
    vision: true,
    apiKey: "secret-value",
  });

  assert.equal(saved.provider, "openai-compatible");
  assert.equal(saved.configured, true);
  assert.equal(saved.hasApiKey, true);
  assert.equal(saved.apiKeySource, "secure-storage");
  const configText = readFileSync(saved.configPath, "utf8");
  assert.doesNotMatch(configText, /secret-value/);
  assert.match(configText, /"modelPresets"/);
  assert.match(readFileSync(path.join(root, "agent-provider.secrets.json"), "utf8"), /c2VhbGVk/);
  assert.deepEqual(store.runtimeConfiguration(), {
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1/",
    model: "vision-model",
    supportsVision: true,
    apiKey: "secret-value",
  });
});

test("legacy Copilot settings migrate to first-run custom model setup", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "agent-provider.json"),
    JSON.stringify({
      version: 1,
      provider: "copilot",
      openaiCompatible: {
        baseUrl: "https://legacy.example/v1",
        model: "legacy-model",
        vision: true,
      },
    }),
  );

  const migrated = store.reload();
  assert.equal(migrated.provider, "openai-compatible");
  assert.equal(migrated.configured, false);
  assert.equal(migrated.baseUrl, "");
  assert.equal(migrated.model, "");
  assert.doesNotMatch(readFileSync(migrated.configPath, "utf8"), /"provider": "copilot"/);
});

test("model presets are globally configurable and survive UI settings saves", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "agent-provider.json"),
    JSON.stringify({
      version: 1,
      provider: "openai-compatible",
      openaiCompatible: {
        baseUrl: "https://custom.example/v1",
        model: "company-vision",
        vision: true,
        modelPresets: [{
          id: "company-vision",
          label: "Company Vision",
          baseUrl: "https://custom.example/v1",
          badge: "CV",
          source: "Internal gateway",
          verified: true,
          capabilities: ["vision", "function-calling"],
        }],
      },
    }),
  );

  const reloaded = store.reload();
  assert.deepEqual(reloaded.modelPresets.map((preset) => preset.id), ["company-vision"]);
  assert.equal(reloaded.modelPresets[0]?.baseUrl, "https://custom.example/v1");
  const saved = store.save({
    provider: "openai-compatible",
    baseUrl: reloaded.baseUrl,
    model: reloaded.model,
    vision: reloaded.vision,
  });
  assert.deepEqual(saved.modelPresets.map((preset) => preset.id), ["company-vision"]);
  assert.match(readFileSync(saved.configPath, "utf8"), /"Internal gateway"/);
  assert.match(readFileSync(saved.configPath, "utf8"), /https:\/\/custom\.example\/v1/);
});

test("bundled presets gain their suggested endpoint without replacing custom entries", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "agent-provider.json"),
    JSON.stringify({
      version: 1,
      provider: "openai-compatible",
      openaiCompatible: {
        baseUrl: "https://old.example/v1",
        model: "qwen3.7-plus",
        vision: true,
        modelPresets: [
          { id: "qwen3.7-plus", label: "Qwen 3.7 Plus" },
          { id: "local-model", label: "Local model" },
        ],
      },
    }),
  );

  const reloaded = store.reload();
  assert.equal(
    reloaded.modelPresets[0]?.baseUrl,
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  );
  assert.equal(reloaded.modelPresets[1]?.baseUrl, undefined);
  assert.match(readFileSync(reloaded.configPath, "utf8"), /dashscope\.aliyuncs\.com/);
});

test("legacy bundled presets migrate to a Token Plan endpoint toggle", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "agent-provider.json"),
    JSON.stringify({
      version: 1,
      provider: "openai-compatible",
      openaiCompatible: {
        baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        model: "qwen3.7-plus",
        vision: true,
        modelPresets: [
          {
            id: "qwen3.7-plus",
            label: "Qwen 3.7 Plus",
            baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
            source: "Alibaba Cloud Token Plan",
          },
          {
            id: "qwen3.8-max",
            label: "Qwen 3.8 Max",
            baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
            source: "Alibaba Cloud Token Plan",
          },
        ],
      },
    }),
  );

  const migrated = store.reload();
  const qwen37 = migrated.modelPresets.filter((preset) => preset.id === "qwen3.7-plus");
  assert.equal(qwen37.length, 1);
  assert.equal(qwen37[0]?.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(qwen37[0]?.tokenPlanBaseUrl, "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
  assert.match(readFileSync(migrated.configPath, "utf8"), /"tokenPlanBaseUrl"/);
});

test("environment overrides win over the configuration file", (t) => {
  const env: NodeJS.ProcessEnv = {
    [OPENAI_COMPATIBLE_ENV.provider]: "openai-compatible",
    [OPENAI_COMPATIBLE_ENV.baseUrl]: "http://localhost:9000/v1",
    [OPENAI_COMPATIBLE_ENV.model]: "environment-model",
    [OPENAI_COMPATIBLE_ENV.vision]: "false",
    FILE_KEY: "environment-key",
  };
  const { root, store } = fixture(env);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "agent-provider.json"),
    JSON.stringify({
      version: 1,
      provider: "copilot",
      openaiCompatible: {
        baseUrl: "https://file.example/v1",
        model: "file-model",
        vision: true,
        apiKeyEnv: "FILE_KEY",
      },
    }),
  );

  const snapshot = store.reload();
  assert.equal(snapshot.model, "environment-model");
  assert.equal(snapshot.vision, false);
  assert.equal(snapshot.apiKeySource, "environment");
  assert.deepEqual(snapshot.environmentOverrides, ["provider", "baseUrl", "model", "vision", "apiKey"]);
  const runtime = store.runtimeConfiguration();
  assert.equal(runtime.provider === "openai-compatible" ? runtime.apiKey : undefined, "environment-key");
});

test("an environment API key avoids unnecessary secure-storage decryption", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let decryptCalls = 0;
  let availabilityCalls = 0;
  const store = new AgentSettingsStore({
    configPath: path.join(root, "agent-provider.json"),
    secretPath: path.join(root, "agent-provider.secrets.json"),
    codec: {
      ...testCodec,
      available: () => {
        availabilityCalls += 1;
        return true;
      },
      decrypt: (value) => {
        decryptCalls += 1;
        return testCodec.decrypt(value);
      },
    },
    secureStorageAvailable: true,
    env: { [OPENAI_COMPATIBLE_ENV.apiKey]: "environment-key" },
  });
  writeFileSync(
    path.join(root, "agent-provider.secrets.json"),
    JSON.stringify({ version: 1, apiKey: Buffer.from("sealed:stored-key").toString("base64") }),
  );

  assert.equal(store.snapshot().apiKeySource, "environment");
  assert.equal(decryptCalls, 0);
  assert.equal(availabilityCalls, 0);
});

test("first-run setup never probes secure storage before endpoint and model exist", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let decryptCalls = 0;
  const store = new AgentSettingsStore({
    configPath: path.join(root, "agent-provider.json"),
    secretPath: path.join(root, "agent-provider.secrets.json"),
    codec: {
      ...testCodec,
      decrypt: (value) => {
        decryptCalls += 1;
        return testCodec.decrypt(value);
      },
    },
    env: {},
  });
  writeFileSync(
    path.join(root, "agent-provider.secrets.json"),
    JSON.stringify({ version: 1, apiKey: Buffer.from("sealed:old-key").toString("base64") }),
  );

  assert.equal(store.snapshot().configured, false);
  assert.equal(store.snapshot().hasApiKey, false);
  assert.equal(store.runtimeConfiguration().apiKey, undefined);
  assert.equal(decryptCalls, 0);
});

test("settings snapshots and startup runtime never decrypt a stored key", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let decryptCalls = 0;
  const store = new AgentSettingsStore({
    configPath: path.join(root, "agent-provider.json"),
    secretPath: path.join(root, "agent-provider.secrets.json"),
    codec: {
      ...testCodec,
      decrypt: (value) => {
        decryptCalls += 1;
        return testCodec.decrypt(value);
      },
    },
    env: {},
  });
  store.save({
    provider: "openai-compatible",
    baseUrl: "https://model.example/v1",
    model: "vision-model",
    vision: true,
    apiKey: "stored-key",
  });
  decryptCalls = 0;

  assert.equal(store.snapshot().hasApiKey, true);
  assert.equal(store.runtimeConfiguration({ includeSecureKey: false }).apiKey, undefined);
  assert.equal(decryptCalls, 0);
  assert.equal(store.runtimeConfiguration().apiKey, "stored-key");
  assert.equal(decryptCalls, 1);
});

test("an invalid hand-edited file reports an error without replacing the active config", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  store.save({
    provider: "openai-compatible",
    baseUrl: "https://valid.example/v1",
    model: "valid-model",
    vision: true,
  });
  writeFileSync(store.snapshot().configPath, "{ not json");

  const snapshot = store.reload();
  assert.match(snapshot.configError ?? "", /Could not read provider configuration/);
  assert.equal(snapshot.provider, "openai-compatible");
  assert.equal(snapshot.model, "valid-model");
});

test("plaintext fallback is refused when secure storage is unavailable", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new AgentSettingsStore({
    configPath: path.join(root, "agent-provider.json"),
    secretPath: path.join(root, "agent-provider.secrets.json"),
    codec: { available: () => false, encrypt: () => Buffer.alloc(0), decrypt: () => "" },
    env: {},
  });
  assert.throws(
    () => store.save({
      provider: "openai-compatible",
      baseUrl: "https://valid.example/v1",
      model: "model",
      vision: true,
      apiKey: "must-not-be-plaintext",
    }),
    /Secure credential storage is unavailable/,
  );
});
