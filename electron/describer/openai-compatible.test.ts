import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OpenAICompatibleRuntime } from "../agent-runtime/openai-compatible-runtime";
import { Describer } from "./describer";

function completion(id: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name: "submit_analysis", arguments: JSON.stringify(payload) },
            },
          ],
        },
      },
    ],
  });
}

test("custom endpoint Analyze and feedback persist validated text-only analysis", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-openai-analyze-"));
  const previousRoot = process.env.SKILL_RECORDER_SESSIONS_DIR;
  process.env.SKILL_RECORDER_SESSIONS_DIR = root;
  t.after(() => {
    if (previousRoot === undefined) delete process.env.SKILL_RECORDER_SESSIONS_DIR;
    else process.env.SKILL_RECORDER_SESSIONS_DIR = previousRoot;
    rmSync(root, { recursive: true, force: true });
  });

  const sessionId = "openai-analyze-fixture";
  const dir = path.join(root, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "session.json"),
    JSON.stringify({
      id: sessionId,
      startedAt: 1_700_000_000_000,
      stoppedAt: 1_700_000_010_000,
      platform: "darwin",
      appVersion: "test",
    }),
  );
  writeFileSync(path.join(dir, "events.jsonl"), "");

  const requests: Array<{ headers: Record<string, string | string[] | undefined>; body: unknown }> = [];
  const responses = [
    completion("submit-1", {
      title: "Review Timeline",
      intent: "Review a captured work timeline.",
      intentConfidence: "high",
      intentRationale: "Opened the recording and reviewed its captured activity.",
      steps: [
        {
          id: "s1",
          title: "Reviewed the timeline",
          detail: "Reviewed the captured activity in chronological order.",
          confidence: "high",
        },
      ],
    }),
    completion("submit-2", {
      title: "Summarize Timeline",
      intent: "Summarize the captured work timeline.",
      intentConfidence: "high",
      intentRationale: "Reviewed the recording and incorporated the requested correction.",
      steps: [
        {
          id: "s1",
          title: "Summarized the timeline",
          detail: "Summarized the captured activity in chronological order.",
          confidence: "high",
        },
      ],
    }),
  ];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    const next = responses.shift();
    assert.ok(next, "unexpected Chat Completions request");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(next);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;

  const runtime = new OpenAICompatibleRuntime({
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "fixture-key",
    model: "fixture-model",
  });
  const describer = new Describer(() => undefined, runtime);
  t.after(() => describer.dispose());

  const first = await describer.analyze(sessionId);
  assert.equal(first.revision, 1);
  assert.equal(first.intent, "Review a captured work timeline.");

  const revised = await describer.feedback(sessionId, {
    overall: "Make the intent about summarizing.",
    steps: [],
  });
  assert.equal(revised.revision, 2);
  assert.equal(revised.intent, "Summarize the captured work timeline.");
  assert.equal(revised.feedbackLog[0]?.overall, "Make the intent about summarizing.");

  const persisted = JSON.parse(readFileSync(path.join(dir, "analysis.json"), "utf8")) as {
    revision: number;
    intent: string;
  };
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.intent, revised.intent);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.authorization, "Bearer fixture-key");

  const firstBody = requests[0].body as {
    messages: Array<{ role: string; content: string }>;
    tools: Array<{ function: { name: string } }>;
  };
  assert.deepEqual(
    firstBody.tools.map((entry) => entry.function.name),
    ["get_timeline", "get_events", "get_narration", "submit_analysis"],
  );
  assert.match(firstBody.messages[0].content, /Screen frame tools are unavailable/);

  const feedbackBody = requests[1].body as { messages: Array<Record<string, unknown>> };
  assert.ok(feedbackBody.messages.some((message) => message.role === "tool"));
  assert.match(
    String(feedbackBody.messages.at(-1)?.content),
    /Make the intent about summarizing/,
  );
});
