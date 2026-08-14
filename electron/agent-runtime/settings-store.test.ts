import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OPENAI_COMPATIBLE_ENV } from "./runtime-factory";
import { AgentSettingsStore, type SecretCodec } from "./settings-store";

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

test("provider settings persist non-secrets and keep the API key encrypted", (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(store.snapshot().provider, "copilot");
  const saved = store.save({
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1/",
    model: "vision-model",
    vision: true,
    apiKey: "secret-value",
  });

  assert.equal(saved.provider, "openai-compatible");
  assert.equal(saved.hasApiKey, true);
  assert.equal(saved.apiKeySource, "secure-storage");
  const configText = readFileSync(saved.configPath, "utf8");
  assert.doesNotMatch(configText, /secret-value/);
  assert.match(readFileSync(path.join(root, "agent-provider.secrets.json"), "utf8"), /c2VhbGVk/);
  assert.deepEqual(store.runtimeConfiguration(), {
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1/",
    model: "vision-model",
    supportsVision: true,
    apiKey: "secret-value",
  });
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
