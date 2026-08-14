import assert from "node:assert/strict";
import test from "node:test";

import { COPILOT_SIGNED_OUT_ERROR } from "../../common/ipc";
import {
  CopilotAgentRuntime,
  type CopilotClientPort,
} from "./copilot-runtime";
import { AgentRuntimeError } from "./errors";
import type { AgentTool } from "./types";

function model(
  id: string,
  options: { enabled?: boolean; vision?: boolean } = {},
) {
  return {
    id,
    name: id,
    capabilities: {
      supports: {
        vision: options.vision ?? false,
        reasoningEffort: false,
      },
      limits: { max_context_window_tokens: 128_000 },
    },
    policy: {
      state: options.enabled === false ? ("disabled" as const) : ("enabled" as const),
      terms: "",
    },
  };
}

test("Copilot runtime preserves session scope and lifecycle", async () => {
  let starts = 0;
  let stops = 0;
  let aborts = 0;
  let disconnects = 0;
  const sent: Array<{ prompt: string; timeout?: number }> = [];
  let capturedConfig: Parameters<CopilotClientPort["createSession"]>[0] | undefined;

  const client: CopilotClientPort = {
    async start() {
      starts += 1;
    },
    async stop() {
      stops += 1;
    },
    async getAuthStatus() {
      return { isAuthenticated: true, login: "octocat" };
    },
    async listModels() {
      return [
        model("text-model"),
        model("vision-model", { vision: true }),
        model("disabled-model", { enabled: false }),
      ];
    },
    async createSession(config) {
      capturedConfig = config;
      return {
        async sendAndWait(prompt, timeout) {
          sent.push({ prompt, timeout });
        },
        async abort() {
          aborts += 1;
        },
        async disconnect() {
          disconnects += 1;
        },
      };
    },
  };

  const runtime = new CopilotAgentRuntime("Test", () => client);
  const [firstStatus, secondStatus] = await Promise.all([
    runtime.checkConnection(),
    runtime.checkConnection(),
  ]);
  assert.deepEqual(firstStatus, { connected: true, login: "octocat" });
  assert.deepEqual(secondStatus, firstStatus);
  assert.equal(starts, 1);

  assert.deepEqual(await runtime.listModels(), [
    { id: "text-model", enabled: true, supportsVision: false },
    { id: "vision-model", enabled: true, supportsVision: true },
    { id: "disabled-model", enabled: false, supportsVision: false },
  ]);

  const toolCalls: unknown[] = [];
  const echoTool: AgentTool = {
    name: "echo",
    description: "Echo the input",
    parameters: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    },
    async handler(input) {
      toolCalls.push(input);
      return { textResultForLlm: "echoed", resultType: "success" };
    },
  };

  const session = await runtime.createSession({
    systemInstructions: "Stay scoped.",
    tools: [echoTool],
    workingDirectory: "/tmp/skill-recorder-test",
    model: "vision-model",
  });

  assert.ok(capturedConfig);
  assert.deepEqual(capturedConfig.systemMessage, {
    mode: "append",
    content: "Stay scoped.",
  });
  assert.equal(capturedConfig.workingDirectory, "/tmp/skill-recorder-test");
  assert.equal(capturedConfig.model, "vision-model");
  assert.equal(capturedConfig.enableHostGitOperations, false);
  assert.deepEqual(capturedConfig.infiniteSessions, { enabled: false });
  assert.deepEqual(capturedConfig.availableTools, ["echo"]);
  const sdkTool = capturedConfig.tools?.[0];
  assert.ok(sdkTool?.handler);
  assert.equal(sdkTool.defer, "never");
  assert.deepEqual(
    await sdkTool.handler(
      { value: "hello" },
      {
        sessionId: "test",
        toolCallId: "call-1",
        toolName: "echo",
        arguments: { value: "hello" },
      },
    ),
    { textResultForLlm: "echoed", resultType: "success" },
  );
  assert.deepEqual(toolCalls, [{ value: "hello" }]);

  await session.run("Build it", { timeoutMs: 42_000 });
  await session.abort();
  await session.dispose();
  await runtime.dispose();

  assert.deepEqual(sent, [{ prompt: "Build it", timeout: 42_000 }]);
  assert.equal(aborts, 1);
  assert.equal(disconnects, 1);
  assert.equal(stops, 1);
});

test("Copilot runtime resets after a signed-out connection", async () => {
  let clients = 0;
  let stops = 0;
  const runtime = new CopilotAgentRuntime("SignedOutTest", () => {
    clients += 1;
    return {
      async start() {},
      async stop() {
        stops += 1;
      },
      async getAuthStatus() {
        return { isAuthenticated: false };
      },
      async listModels() {
        return [];
      },
      async createSession() {
        throw new Error("not reached");
      },
    };
  });

  await assert.rejects(runtime.checkConnection(), (error) => {
    assert.ok(error instanceof AgentRuntimeError);
    assert.equal(error.message, COPILOT_SIGNED_OUT_ERROR);
    assert.equal(error.code, "authentication_required");
    assert.equal(error.provider, "copilot");
    assert.equal(error.retryable, false);
    return true;
  });
  await assert.rejects(runtime.checkConnection(), new RegExp(COPILOT_SIGNED_OUT_ERROR));
  assert.equal(clients, 2);
  assert.equal(stops, 2);
});
