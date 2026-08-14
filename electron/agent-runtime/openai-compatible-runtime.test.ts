import assert from "node:assert/strict";
import test from "node:test";

import { AgentRuntimeError } from "./errors";
import {
  chatCompletionsUrl,
  OpenAICompatibleRuntime,
  type AgentFetch,
} from "./openai-compatible-runtime";
import type { AgentTool } from "./types";

function assistant(toolCalls: Array<{ id: string; name: string; arguments: string }> = []): Response {
  return Response.json({
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          ...(toolCalls.length
            ? {
                tool_calls: toolCalls.map((call) => ({
                  id: call.id,
                  type: "function",
                  function: { name: call.name, arguments: call.arguments },
                })),
              }
            : {}),
        },
      },
    ],
  });
}

function scriptedFetch(responses: Response[], requests: RequestInit[]): AgentFetch {
  return async (_input, init) => {
    requests.push(init ?? {});
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  };
}

function tool(name: string, handler: AgentTool["handler"], completesRun = false): AgentTool {
  return {
    name,
    description: `${name} description`,
    parameters: { type: "object", additionalProperties: false },
    completesRun,
    handler,
  };
}

test("OpenAI-compatible runtime executes text tools sequentially and preserves history", async () => {
  const requests: RequestInit[] = [];
  const calls: Array<{ name: string; input: unknown }> = [];
  const runtime = new OpenAICompatibleRuntime(
    {
      baseUrl: "https://llm.example.test/v1/",
      apiKey: "test-secret-key",
      model: "configured-model",
    },
    scriptedFetch(
      [
        assistant([{ id: "read-1", name: "read", arguments: '{"topic":"timeline"}' }]),
        assistant([{ id: "submit-1", name: "submit", arguments: '{"intent":"Test"}' }]),
      ],
      requests,
    ),
  );
  const session = await runtime.createSession({
    systemInstructions: "Analyze safely.",
    model: "session-model",
    tools: [
      tool("read", (input) => {
        calls.push({ name: "read", input });
        return "timeline result";
      }),
      tool(
        "submit",
        (input) => {
          calls.push({ name: "submit", input });
          return { textResultForLlm: "recorded", resultType: "success" };
        },
        true,
      ),
    ],
  });

  await session.run("Start", { timeoutMs: 5_000 });
  assert.deepEqual(calls, [
    { name: "read", input: { topic: "timeline" } },
    { name: "submit", input: { intent: "Test" } },
  ]);
  assert.equal(requests.length, 2);
  assert.equal((requests[0].headers as Record<string, string>).authorization, "Bearer test-secret-key");

  const firstBody = JSON.parse(String(requests[0].body)) as Record<string, unknown>;
  assert.equal(firstBody.model, "session-model");
  assert.deepEqual(
    (firstBody.tools as Array<{ function: { name: string } }>).map((entry) => entry.function.name),
    ["read", "submit"],
  );
  const secondBody = JSON.parse(String(requests[1].body)) as {
    messages: Array<Record<string, unknown>>;
  };
  assert.deepEqual(secondBody.messages.at(-1), {
    role: "tool",
    tool_call_id: "read-1",
    content: "timeline result",
  });
  await runtime.dispose();
});

test("OpenAI-compatible runtime allows two JSON/schema repair attempts", async () => {
  const requests: RequestInit[] = [];
  let handlerCalls = 0;
  const runtime = new OpenAICompatibleRuntime(
    { baseUrl: "http://127.0.0.1:1234/v1", model: "local-model" },
    scriptedFetch(
      [
        assistant([{ id: "bad-json", name: "submit", arguments: "{" }]),
        assistant([{ id: "bad-schema", name: "submit", arguments: '{"intent":1}' }]),
        assistant([{ id: "fixed", name: "submit", arguments: '{"intent":"Fixed"}' }]),
      ],
      requests,
    ),
  );
  const session = await runtime.createSession({
    systemInstructions: "Submit.",
    tools: [
      tool(
        "submit",
        (input) => {
          handlerCalls += 1;
          return typeof (input as { intent?: unknown }).intent === "string"
            ? { textResultForLlm: "accepted", resultType: "success" }
            : { textResultForLlm: "intent must be a string", resultType: "failure" };
        },
        true,
      ),
    ],
  });

  await session.run("Submit", { timeoutMs: 5_000 });
  assert.equal(handlerCalls, 2);
  assert.equal(requests.length, 3);
  const secondBody = JSON.parse(String(requests[1].body)) as { messages: Array<Record<string, unknown>> };
  assert.match(String(secondBody.messages.at(-1)?.content), /valid JSON/);
  const thirdBody = JSON.parse(String(requests[2].body)) as { messages: Array<Record<string, unknown>> };
  assert.equal(thirdBody.messages.at(-1)?.content, "intent must be a string");
});

test("vision-enabled runtime forwards inline image tool results to the next model turn", async () => {
  const requests: RequestInit[] = [];
  const runtime = new OpenAICompatibleRuntime(
    {
      baseUrl: "https://llm.example.test/v1",
      model: "vision-model",
      supportsVision: true,
    },
    scriptedFetch(
      [
        assistant([{ id: "frames-1", name: "get_frames", arguments: "{}" }]),
        assistant([{ id: "submit-1", name: "submit", arguments: "{}" }]),
      ],
      requests,
    ),
  );
  const session = await runtime.createSession({
    systemInstructions: "Inspect frames.",
    tools: [
      tool("get_frames", () => ({
        textResultForLlm: "One frame at 1.0s",
        binaryResultsForLlm: [
          { data: "aGVsbG8=", mimeType: "image/jpeg", type: "image" },
        ],
        resultType: "success",
      })),
      tool("submit", () => "done", true),
    ],
  });

  await session.run("Analyze", { timeoutMs: 5_000 });
  assert.deepEqual(runtime.capabilities, { vision: true });
  const secondBody = JSON.parse(String(requests[1].body)) as {
    messages: Array<{ role: string; content: unknown }>;
  };
  const imageMessage = secondBody.messages.at(-1);
  assert.equal(imageMessage?.role, "user");
  assert.deepEqual(imageMessage?.content, [
    { type: "text", text: "Images returned by tool get_frames for call frames-1:" },
    {
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,aGVsbG8=", detail: "auto" },
    },
  ]);
});

test("OpenAI-compatible runtime fails closed on an unknown tool", async () => {
  let allowedCalls = 0;
  const runtime = new OpenAICompatibleRuntime(
    { baseUrl: "https://llm.example.test/v1", model: "model" },
    scriptedFetch(
      [assistant([{ id: "shell-1", name: "shell", arguments: "{}" }])],
      [],
    ),
  );
  const session = await runtime.createSession({
    systemInstructions: "Stay scoped.",
    tools: [tool("allowed", () => { allowedCalls += 1; return "ok"; })],
  });

  await assert.rejects(session.run("Go", { timeoutMs: 5_000 }), (error) => {
    assert.ok(error instanceof AgentRuntimeError);
    assert.equal(error.code, "tool_failed");
    assert.match(error.message, /not allowed: shell/);
    return true;
  });
  assert.equal(allowedCalls, 0);
});

function hangingFetch(): AgentFetch {
  return async (_input, init) =>
    await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
        once: true,
      });
    });
}

test("OpenAI-compatible runtime supports cancellation and total-run deadlines", async () => {
  const runtime = new OpenAICompatibleRuntime(
    { baseUrl: "https://llm.example.test/v1", model: "model" },
    hangingFetch(),
  );
  const cancelled = await runtime.createSession({ systemInstructions: "Wait.", tools: [] });
  const pending = cancelled.run("Wait", { timeoutMs: 5_000 });
  await Promise.resolve();
  await cancelled.abort();
  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof AgentRuntimeError);
    assert.equal(error.code, "aborted");
    return true;
  });

  const timed = await runtime.createSession({ systemInstructions: "Wait.", tools: [] });
  await assert.rejects(timed.run("Wait", { timeoutMs: 10 }), (error) => {
    assert.ok(error instanceof AgentRuntimeError);
    assert.equal(error.code, "timeout");
    return true;
  });
  await runtime.dispose();
});

test("OpenAI-compatible runtime redacts response bodies and credentials from errors", async () => {
  const secret = "super-secret-key";
  const endpointSecret = "provider-body-secret";
  const runtime = new OpenAICompatibleRuntime(
    { baseUrl: "https://llm.example.test/v1", apiKey: secret, model: "model" },
    async () => new Response(endpointSecret, { status: 401 }),
  );
  const session = await runtime.createSession({ systemInstructions: "Test.", tools: [] });
  await assert.rejects(session.run("Test", { timeoutMs: 5_000 }), (error) => {
    assert.ok(error instanceof AgentRuntimeError);
    assert.equal(error.code, "authentication_required");
    assert.doesNotMatch(error.message, new RegExp(secret));
    assert.doesNotMatch(error.message, new RegExp(endpointSecret));
    assert.doesNotMatch(error.message, /llm\.example/);
    return true;
  });
});

test("OpenAI-compatible URL validation permits only HTTPS or loopback HTTP", () => {
  assert.equal(
    chatCompletionsUrl("https://example.test/v1/").href,
    "https://example.test/v1/chat/completions",
  );
  assert.equal(
    chatCompletionsUrl("http://localhost:1234/v1").href,
    "http://localhost:1234/v1/chat/completions",
  );
  assert.throws(() => chatCompletionsUrl("http://example.test/v1"), /must use HTTPS/);
  assert.throws(() => chatCompletionsUrl("https://user:pass@example.test/v1"), /credentials/);
});
