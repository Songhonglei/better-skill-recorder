import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OpenAICompatibleRuntime, type AgentFetch } from "../agent-runtime/openai-compatible-runtime";
import { AutomationBuilder } from "../automationbuilder/builder";
import { SkillBuilder } from "../skillbuilder/builder";

function completion(id: string, name: string, payload: Record<string, unknown>): Response {
  return Response.json({
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(payload) },
            },
          ],
        },
      },
    ],
  });
}

function fetchQueue(responses: Response[], requests: Array<Record<string, unknown>>): AgentFetch {
  return async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const response = responses.shift();
    if (!response) throw new Error("Unexpected Chat Completions request");
    return response;
  };
}

function writeAnalysis(root: string, sessionId: string): void {
  const dir = path.join(root, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "events.jsonl"), "");
  writeFileSync(
    path.join(dir, "analysis.json"),
    JSON.stringify({
      version: 1,
      sessionId,
      revision: 1,
      createdAt: Date.now(),
      narrationSourceUpdatedAt: null,
      title: "Review Example",
      intent: "Review an example website.",
      intentConfidence: "high",
      intentRationale: "Opened the example page and reviewed its content.",
      steps: [
        {
          id: "s1",
          title: "Opened the example",
          detail: "Opened the example page.",
          apps: ["Browser"],
          evidence: ["https://example.com"],
          confidence: "high",
        },
      ],
      feedbackLog: [],
      approved: true,
    }),
  );
}

test("custom provider plans, refines, and creates a Skill", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-openai-skill-"));
  const exportRoot = path.join(root, "exports");
  const previousSessions = process.env.SKILL_RECORDER_SESSIONS_DIR;
  process.env.SKILL_RECORDER_SESSIONS_DIR = root;
  t.after(() => {
    if (previousSessions === undefined) delete process.env.SKILL_RECORDER_SESSIONS_DIR;
    else process.env.SKILL_RECORDER_SESSIONS_DIR = previousSessions;
    rmSync(root, { recursive: true, force: true });
  });
  const sessionId = "openai-skill-fixture";
  writeAnalysis(root, sessionId);

  const initialPlan = {
    name: "review-example",
    title: "Review example",
    description: "Review the configured example website when asked.",
    summary: "Reviews one website.",
    generalization: "Use the configured site as the starting point.",
    values: [{ id: "site_url", name: "Site URL", value: "https://example.com" }],
    steps: [
      {
        kind: "action",
        title: "Open site",
        text: "Open {{site_url}} and review the page.",
        tool: "browser",
      },
    ],
    allowedTools: ["browser"],
  };
  const refinedPlan = { ...initialPlan, title: "Review configured example" };
  const requests: Array<Record<string, unknown>> = [];
  const runtime = new OpenAICompatibleRuntime(
    { baseUrl: "https://llm.example.test/v1", model: "builder-model" },
    fetchQueue(
      [
        completion("plan-1", "propose_plan", initialPlan),
        completion("plan-2", "propose_plan", refinedPlan),
        completion("skill-1", "submit_skill", {
          name: "review-example",
          description: "Review the configured example website when asked.",
          allowedTools: ["browser"],
          body: "Open {{site_url}} with the browser and summarize the page.",
        }),
      ],
      requests,
    ),
  );
  const builder = new SkillBuilder(() => undefined, runtime);
  t.after(() => builder.dispose());

  const proposed = await builder.build({ sessionId, architecture: "scout" });
  assert.equal(proposed.title, "Review example");
  const refined = await builder.build({
    sessionId,
    architecture: "scout",
    feedback: "Make the title explicit.",
  });
  assert.equal(refined.title, "Review configured example");
  const created = await builder.create(sessionId, refined, { kind: "export", dir: exportRoot });
  assert.ok(existsSync(created.path));
  assert.match(readFileSync(created.path, "utf8"), /https:\/\/example\.com/);
  assert.equal(requests.length, 3);
  const refineMessages = requests[1].messages as Array<Record<string, unknown>>;
  assert.ok(refineMessages.some((message) => message.role === "tool"));
});

test("custom provider plans and refines an Automation before deterministic export", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "skill-recorder-openai-automation-"));
  const automationRoot = path.join(root, "automations");
  const previousSessions = process.env.SKILL_RECORDER_SESSIONS_DIR;
  const previousAutomations = process.env.SKILL_RECORDER_AUTOMATIONS_DIR;
  process.env.SKILL_RECORDER_SESSIONS_DIR = root;
  process.env.SKILL_RECORDER_AUTOMATIONS_DIR = automationRoot;
  t.after(() => {
    if (previousSessions === undefined) delete process.env.SKILL_RECORDER_SESSIONS_DIR;
    else process.env.SKILL_RECORDER_SESSIONS_DIR = previousSessions;
    if (previousAutomations === undefined) delete process.env.SKILL_RECORDER_AUTOMATIONS_DIR;
    else process.env.SKILL_RECORDER_AUTOMATIONS_DIR = previousAutomations;
    rmSync(root, { recursive: true, force: true });
  });
  const sessionId = "openai-automation-fixture";
  writeAnalysis(root, sessionId);

  const initialPlan = {
    name: "daily-example-review",
    title: "Daily example review",
    description: "Review the example website every weekday.",
    summary: "Reviews one website on a schedule.",
    generalization: "Repeat the review on a schedule.",
    trigger: {
      type: "schedule",
      schedule: {
        kind: "single",
        naturalLanguage: "Every weekday at 9 AM",
        days: [1, 2, 3, 4, 5],
        time: { hour: 9, minute: 0 },
      },
    },
    values: [{ id: "site_url", name: "Site URL", value: "https://example.com" }],
    steps: [{ label: "Review site", prompt: "Open {{site_url}} and summarize changes." }],
  };
  const refinedPlan = {
    ...initialPlan,
    trigger: {
      ...initialPlan.trigger,
      schedule: {
        ...initialPlan.trigger.schedule,
        naturalLanguage: "Every weekday at 10 AM",
        time: { hour: 10, minute: 0 },
      },
    },
  };
  const requests: Array<Record<string, unknown>> = [];
  const runtime = new OpenAICompatibleRuntime(
    { baseUrl: "https://llm.example.test/v1", model: "builder-model" },
    fetchQueue(
      [
        completion("automation-1", "propose_automation_plan", initialPlan),
        completion("automation-2", "propose_automation_plan", refinedPlan),
      ],
      requests,
    ),
  );
  const builder = new AutomationBuilder(() => undefined, runtime);
  t.after(() => builder.dispose());

  await builder.build({ sessionId, architecture: "scout" });
  const refined = await builder.build({
    sessionId,
    architecture: "scout",
    feedback: "Run at 10 AM instead.",
  });
  assert.equal(refined.trigger.schedule.naturalLanguage, "Every weekday at 10 AM");
  const created = await builder.create(sessionId, refined);
  assert.ok(existsSync(created.path));
  assert.match(readFileSync(created.path, "utf8"), /https:\/\/example\.com/);
  // Export is deterministic and does not make a third model request.
  assert.equal(requests.length, 2);
});
