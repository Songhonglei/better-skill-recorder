import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyzeRuntime, OPENAI_COMPATIBLE_ENV } from "./runtime-factory";

test("Analyze runtime defaults to Copilot and accepts temporary custom configuration", async () => {
  const defaultRuntime = createAnalyzeRuntime("FactoryTest", {});
  assert.equal(defaultRuntime.id, "copilot");
  await defaultRuntime.dispose();

  const env: NodeJS.ProcessEnv = {
    [OPENAI_COMPATIBLE_ENV.provider]: "openai-compatible",
    [OPENAI_COMPATIBLE_ENV.baseUrl]: "http://127.0.0.1:1234/v1",
    [OPENAI_COMPATIBLE_ENV.apiKey]: "temporary-key",
    [OPENAI_COMPATIBLE_ENV.model]: "local-model",
  };
  const customRuntime = createAnalyzeRuntime("FactoryTest", env);
  assert.equal(customRuntime.id, "openai-compatible");
  assert.deepEqual(customRuntime.capabilities, { vision: false });
  assert.deepEqual(await customRuntime.listModels?.(), [
    { id: "local-model", enabled: true, supportsVision: false },
  ]);
  // Caller-owned configuration is not mutated; only the real process environment is scrubbed.
  assert.equal(env[OPENAI_COMPATIBLE_ENV.apiKey], "temporary-key");
  await customRuntime.dispose();
});

test("temporary API key is removed from the app process environment after bootstrap", async () => {
  const previous = Object.fromEntries(
    Object.values(OPENAI_COMPATIBLE_ENV).map((name) => [name, process.env[name]]),
  );
  try {
    process.env[OPENAI_COMPATIBLE_ENV.provider] = "openai-compatible";
    process.env[OPENAI_COMPATIBLE_ENV.baseUrl] = "http://127.0.0.1:1234/v1";
    process.env[OPENAI_COMPATIBLE_ENV.apiKey] = "ephemeral-key";
    process.env[OPENAI_COMPATIBLE_ENV.model] = "local-model";
    const runtime = createAnalyzeRuntime("FactoryTest");
    assert.equal(process.env[OPENAI_COMPATIBLE_ENV.apiKey], undefined);
    await runtime.dispose();
  } finally {
    for (const name of Object.values(OPENAI_COMPATIBLE_ENV)) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
