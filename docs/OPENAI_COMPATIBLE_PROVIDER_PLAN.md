# OpenAI-Compatible Provider Evolution Plan

## 1. Objective

Evolve Skill Recorder from a GitHub Copilot-only application into a dual-provider
application that supports:

1. the existing GitHub Copilot path without behavioral regressions; and
2. an OpenAI-compatible endpoint configured with `baseURL`, `apiKey`, and `model`.

The OpenAI-compatible path must cover the full product workflow:

- recording analysis and re-analysis from feedback;
- timeline, event, narration, and optional frame inspection;
- Skill plan proposal, refinement, and `SKILL.md` generation; and
- Automation plan proposal, refinement, and deterministic export.

The design must keep provider-specific code behind a stable internal contract so
that future Microsoft releases can be merged with limited conflict.

## 2. Product principles

- **Copilot remains supported.** Provider work must not fork the product into two
  divergent business flows.
- **Local means local.** The UI must distinguish a loopback endpoint from a remote
  custom endpoint. A custom remote endpoint is not described as private or local.
- **Secrets never enter project files.** API keys live in the operating system's
  secure credential store and are never written to logs, session bundles, debug
  archives, environment snapshots, or Git.
- **Capabilities are explicit.** Tool calling, vision, structured output, and
  context limits are probed or configured rather than inferred from a model name.
- **Fail closed.** The model can invoke only the tools explicitly supplied for the
  current workflow. Invalid tool calls and invalid structured results do not reach
  persistence or export code.
- **Reviewed output stays authoritative.** User-edited analysis and plans remain
  the source of truth for downstream artifacts.

## 3. Current Copilot responsibilities

The existing `@github/copilot-sdk` integration provides:

- client startup and GitHub authentication;
- model discovery and selection of a vision-capable model;
- conversation creation and multi-turn context;
- tool-call dispatch and tool-result return;
- inline image results for frame inspection;
- cancellation, timeout, and session disposal; and
- a final structured submission through `submit_analysis`, `propose_plan`,
  `submit_skill`, or `propose_automation_plan`.

The following components are provider-neutral already and should remain so:

- recording and session storage;
- deterministic timeline and baseline `description.md` generation;
- event, narration, and frame tools;
- on-device transcription and sensitive-data redaction;
- Zod schemas and output validation;
- user review/edit flows; and
- Skill and Automation persistence/export.

## 4. Target architecture

```text
Describer / SkillBuilder / AutomationBuilder
                    |
             AgentRuntime API
             /              \
   CopilotAgentRuntime   OpenAICompatibleRuntime
             |                   |
     Copilot CLI/SDK       Chat/Responses adapter
                                 |
                      baseURL + API key + model
```

### 4.1 Runtime contract

Introduce provider-neutral types owned by this repository, not re-exported SDK
types:

```ts
export interface AgentRuntime {
  readonly id: "copilot" | "openai-compatible";
  checkConnection(signal?: AbortSignal): Promise<ConnectionStatus>;
  listModels?(signal?: AbortSignal): Promise<ModelInfo[]>;
  createSession(options: AgentSessionOptions): Promise<AgentSession>;
  dispose(): Promise<void>;
}

export interface AgentSession {
  run(prompt: string, options: RunOptions): Promise<RunResult>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}
```

`AgentSessionOptions` carries only the capabilities business workflows require:

- system instructions;
- allowed tools and their JSON Schemas;
- working-directory metadata, without granting filesystem access;
- selected model and capability profile;
- progress callbacks; and
- per-run limits.

### 4.2 Internal tool contract

Replace direct imports of `Tool` from `@github/copilot-sdk` with an internal
`AgentTool` type:

```ts
export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  handler(input: unknown): Promise<ToolResult> | ToolResult;
}
```

The Copilot adapter converts `AgentTool` to Copilot SDK tools. The
OpenAI-compatible adapter converts it to the selected protocol's function/tool
schema. Existing handlers remain unchanged except for their imported type.

### 4.3 OpenAI-compatible agent loop

The custom runtime owns this loop:

1. Build the request from system instructions, conversation history, and tools.
2. Send the request with an abort signal and deadline.
3. Append assistant content to the conversation.
4. Validate requested tool names against the current allowlist.
5. Parse and validate tool arguments.
6. Execute tool calls with bounded concurrency.
7. Convert text and image results into protocol-specific tool results.
8. Append tool results and continue until a submission tool succeeds.
9. Reject excessive turns, repeated invalid calls, or missing final submission.
10. Preserve the conversation for feedback/refinement turns until it is evicted.

Recommended defaults:

- maximum 16 model turns per run;
- maximum 8 tool calls per model turn;
- maximum 4 concurrently executing read-only tools;
- existing 180-second workflow deadline;
- two structured-output repair attempts; and
- one finalization nudge when the model stops without submitting.

Submission tools remain the completion boundary. Ordinary assistant prose never
becomes an analysis, plan, or Skill without passing the existing Zod schema.

## 5. Provider configuration

Add a Settings page with:

- provider: GitHub Copilot or OpenAI-compatible;
- base URL;
- API key entry/update/remove action;
- model;
- protocol mode: Auto, Chat Completions, or Responses;
- capability overrides: tool calling, vision, structured output;
- request timeout; and
- Test connection action.

Persist non-secret settings in Electron's application data. Store the API key in:

- macOS Keychain;
- Windows Credential Manager; and
- Secret Service/libsecret on supported Linux desktops.

Do not silently fall back from a configured custom provider to Copilot. Provider
fallback could send recording data to an unexpected destination. Instead, show a
clear error and let the user choose another provider.

Before Analyze, show the actual data destination:

- `GitHub Copilot cloud`;
- `Local endpoint at http://127.0.0.1:...`; or
- `Custom remote endpoint at https://...`.

Reject plaintext remote HTTP endpoints by default. Permit HTTP only for loopback
addresses, with an explicit advanced override for private networks.

## 6. Capability levels and degradation

| Capability | Required behavior |
| --- | --- |
| Tool calling | Required for full workflow; fail connection test if unavailable |
| Vision | Optional; withhold `get_frames` and analyze events/narration only |
| Structured output | Preferred; otherwise rely on submission tools + Zod repair |
| Streaming | Optional; improves progress display but not correctness |
| Model listing | Optional; allow manual model entry |
| Parallel tool calls | Optional; serialize when unsupported |

The connection test must execute a harmless synthetic tool-call round trip rather
than only requesting `/models`. This detects endpoints that advertise compatibility
but cannot complete an agent loop.

## 7. Security and privacy controls

- Keep Advanced Protection and frame withholding provider-neutral.
- Apply redaction before data enters either provider adapter.
- Treat model output and tool arguments as untrusted input.
- Allow only exact tool names supplied for the active workflow.
- Never expose shell, filesystem, Git, or default SDK tools to the model.
- Redact API keys, authorization headers, base URLs containing credentials, and
  provider response bodies from logs.
- Exclude provider credentials and request/response content from debug bundles.
- Add an optional metadata-only audit log: provider, model, request duration,
  tool names, token counts, and error category. Do not log captured content.
- Cap image count, image bytes, event rows, string length, and total request size.
- Add SSRF controls to the desktop main process: normalize the base URL, block
  credential-bearing URLs, and document the trust implications of private-network
  endpoints.

## 8. Implementation phases

### Phase 0 — Fork governance and baseline

- Keep `upstream` pointed at `microsoft/skill-recorder` with push disabled.
- Keep the personal fork as `origin`.
- Preserve an unmodified `main` that regularly fast-forwards from upstream.
- Develop custom changes on `provider/openai-compatible`.
- Record the current baseline: build, 158 tests, license check, and macOS smoke test.

Exit criteria: clean upstream baseline is reproducible locally and in CI.

### Phase 1 — Provider-neutral contracts

- Add `electron/agent-runtime/` contracts and shared error types.
- Wrap existing Copilot behavior in `CopilotAgentRuntime`.
- Convert tool definitions to the internal `AgentTool` type.
- Inject a runtime into Describer and both Builders.
- Keep all UI and behavior unchanged.

Exit criteria: Copilot regression tests and all upstream tests pass; no workflow
imports Copilot SDK types outside the Copilot adapter and eval-specific code.

### Phase 2 — OpenAI-compatible Analyze MVP

- Implement one protocol first: Chat Completions tool calling.
- Add model, base URL, and temporary in-memory API key configuration.
- Implement sequential tool loop, text results, cancellation, deadline, and Zod
  repair.
- Support Analyze and feedback without frames.

Exit criteria: a synthetic recording produces valid `analysis.json` through a
custom endpoint, and invalid tool calls fail safely.

### Phase 3 — Vision and full builders

- Add image tool-result conversion and capability-aware `get_frames` exposure.
- Enable Skill planning/refinement/final generation.
- Enable Automation planning/refinement; preserve deterministic export.
- Add Responses API mode if required by target endpoints.

Exit criteria: Analyze, feedback, Skill, and Automation workflows pass end-to-end
against one remote and one local OpenAI-compatible service.

### Phase 4 — Production settings and credentials

- Add Settings UI, secure credential storage, destination disclosure, connection
  test, capability probe, and provider health indicator.
- Add migration/default logic that leaves existing users on Copilot.
- Add log redaction, request-size limits, protocol diagnostics, and clear errors.

Exit criteria: no API key appears in application data, logs, debug bundles, crash
reports, or tests.

### Phase 5 — Packaging and compatibility hardening

- Test macOS, Windows x64/ARM64, and Ubuntu workflows.
- Update license/compliance inventories for added dependencies.
- Add endpoint compatibility fixtures for Ollama/LM Studio/vLLM or the explicitly
  supported set.
- Publish a fork release with source installer hashes and migration notes.

Exit criteria: release gates match or exceed upstream's build, test, integrity,
license, and packaging gates.

## 9. Test strategy

### 9.1 Runtime contract tests

Use a deterministic fake HTTP server to cover:

- one-shot submission;
- multiple sequential tool calls;
- parallel tool calls;
- text and image tool results;
- malformed JSON arguments;
- unknown and disallowed tool names;
- schema rejection followed by repair;
- missing submission followed by finalization nudge;
- rate limit and transient server failures;
- abort, timeout, and session disposal;
- context/request size limits; and
- secret redaction in errors and logs.

Run the same workflow contract suite against `CopilotAgentRuntime` where practical
and against `OpenAICompatibleRuntime` through recorded protocol fixtures.

### 9.2 Business workflow tests

- Describer fixture produces a validated intent and ordered steps.
- Feedback preserves conversation context and increments revision.
- Skill proposal and refinement preserve edited values and ordering.
- Skill finalization writes a valid `SKILL.md` without unresolved tokens.
- Automation proposal creates a valid trigger and prompt steps.
- Automation export remains deterministic and requires no final LLM call.
- Vision-disabled models never receive screenshots.
- Advanced Protection never leaks an unredacted frame on OCR failure.

### 9.3 Release gates

Every PR must pass:

1. upstream unit tests;
2. typecheck and build;
3. provider contract tests;
4. compliance/license checks;
5. secret scanning;
6. protocol fixture tests; and
7. platform smoke tests appropriate to the changed surface.

## 10. Fork and branch governance

Recommended remotes:

```text
origin    https://github.com/Songhonglei/better-skill-recorder.git
upstream  https://github.com/microsoft/skill-recorder.git
```

Recommended branches:

- `main`: clean mirror of `upstream/main`; no custom commits.
- `provider/openai-compatible`: integration branch for the fork's product changes.
- `feat/<scope>`: short-lived branches merged into the provider branch by PR.
- `release/fork-vX.Y.Z.N`: stabilization branches for fork releases.

Version fork releases as `v0.5.0-provider.1`, then rebase the suffix on each new
upstream version, for example `v0.6.0-provider.1`.

Do not merge the provider branch into the clean mirror branch. This keeps upstream
sync simple and makes the fork's delta reviewable as one long-lived comparison.

## 11. Upstream synchronization

Use a scheduled GitHub Actions workflow to:

1. fetch `upstream/main` and tags;
2. fast-forward the fork's clean `main` when possible;
3. open or refresh an `upstream-sync/<version>` PR targeting
   `provider/openai-compatible`;
4. run the full release gates; and
5. require manual review when protected paths change.

Protected paths include:

- `electron/describer/**`;
- `electron/builders/**`;
- `electron/skillbuilder/**`;
- `electron/automationbuilder/**`;
- `common/analysis.ts`, `common/skill.ts`, and `common/automation.ts`;
- IPC definitions and Settings persistence;
- `package.json` and `package-lock.json`;
- compliance scripts and release workflows; and
- installer scripts.

Generate an upstream impact report in CI containing:

- upstream commit range and release notes;
- changed protected paths;
- Copilot SDK version/API changes;
- schema and prompt changes;
- dependency/license changes; and
- provider contract test results.

Never auto-merge an upstream sync into the provider branch when protected paths,
lockfiles, installers, or compliance policy changed.

## 12. Pull request structure

Keep the first implementation series reviewable:

1. `refactor: introduce provider-neutral agent runtime contracts`
2. `refactor: wrap GitHub Copilot SDK in CopilotAgentRuntime`
3. `test: add agent runtime contract harness`
4. `feat: add OpenAI-compatible tool-call loop`
5. `feat: support custom provider for recording analysis`
6. `feat: support custom provider vision and builders`
7. `feat: add provider settings and secure credentials`
8. `ci: add provider compatibility and upstream-sync gates`
9. `docs: document privacy, compatibility, and release operations`

Each PR should preserve a working application and avoid combining provider
abstraction, new UI, and packaging changes in one review.

## 13. Effort estimate

For one well-defined OpenAI-compatible remote plus one local service:

- provider contracts and Copilot adapter: 3–5 engineering days;
- custom agent loop and tests: 5–8 days;
- Analyze integration including vision: 3–5 days;
- Skill/Automation integration: 2–4 days;
- Settings, secure credentials, and privacy UX: 4–6 days;
- CI, packaging, compliance, and platform validation: 4–7 days.

Expected production-ready total: approximately **3–5 engineering weeks** for one
experienced engineer, including stabilization. Broad compatibility with many
nominally OpenAI-compatible providers should be treated as an additional project,
not assumed by the initial adapter.

## 14. Release acceptance criteria

A fork release is ready only when:

- existing Copilot users can upgrade without changing provider settings;
- both providers complete Analyze, feedback, Skill, and Automation workflows;
- custom-provider destination is disclosed before captured data is sent;
- a vision-disabled model degrades safely and visibly;
- invalid or malicious tool calls cannot escape the workflow allowlist;
- API keys are stored only in the OS credential store and never logged;
- all upstream and provider contract tests pass;
- license and installer integrity gates pass on supported platforms;
- upstream sync documentation names the incorporated Microsoft commit; and
- release notes clearly distinguish Microsoft upstream features from fork-only
  provider features.
