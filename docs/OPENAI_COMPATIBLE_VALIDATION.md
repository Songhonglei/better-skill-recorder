# OpenAI-compatible provider validation

This document records what Better Skill Recorder validates before calling an
OpenAI-compatible model "verified." It distinguishes the app's local automated tests from
live provider compatibility so a preset badge is useful without becoming a blanket promise.

## Current compatibility matrix

The following models were exercised against Alibaba Cloud Token Plan with the same Base URL
and API key supplied through the model-control flow:

| Model ID | Authentication | Function calls | Multi-turn tool loop | Inline image | Result |
| --- | --- | --- | --- | --- | --- |
| `qwen3.7-plus` | Pass | Pass | Pass | Pass | Verified |
| `qwen3.8-max` | Pass | Pass | Pass | Pass | Verified |
| `kimi-k2.5` | Pass | Pass | Pass | Pass | Verified |
| `kimi-k2.6` | Pass | Pass | Pass | Pass | Verified |

`qwen3-vl-plus` is deliberately not a packaged preset: the tested provider returned `404`
and did not advertise that model from its model-list endpoint.

Provider aliases, quotas, and behavior may change independently of this repository. Always
run **Test connection** with the Base URL, model ID, and account you intend to use.

## What the live test proves

The connection test sends a small synthetic request rather than any recording. It verifies:

1. the resolved `/chat/completions` endpoint and authorization header;
2. a model response that requests the app's test function;
3. a tool-result message followed by another model turn;
4. valid JSON function arguments and loop completion; and
5. when Visual analysis is on, OpenAI-style `image_url` transport using a generated inline
   JPEG.

This covers the protocol features used by Analyze, feedback, Skill Builder, and Automation
Builder. It does not guarantee model output quality, account quota, latency, or future
provider availability.

## End-to-end app validation

Before merging the compatibility implementation, the project checks:

- configuration precedence, validation, migration, and per-user preset overrides;
- encrypted API-key storage and the no-key-on-startup path;
- provider routing across Analyze, feedback, Skill Builder, and Automation Builder;
- multi-turn function execution and vision payload construction;
- renderer model-control interactions and disabled/error states;
- recording privacy boundaries: recording alone performs no model request; and
- TypeScript, unit/integration tests, renderer production build, macOS packaging, and
  strict code-signature verification.

The repository remains the source of truth. Run the current checkout's full verification:

```bash
npm run typecheck
npm test
npm run build:vite
npm run dist:app:mac
codesign --verify --deep --strict "release/mac-arm64/Better Skill Recorder.app"
```

## Data boundary

Starting or stopping a recording does not contact Copilot or a custom model. A provider
request begins only after the user chooses **Analyze**, **Test connection**, or a Builder
action. Analyze may send the captured event timeline, window/document titles, URLs,
clipboard previews, narration text, and—when Visual analysis is enabled—selected locally
redacted frames to the active provider.

API keys are never part of the JSON configuration. The UI saves them separately using
Electron `safeStorage`, or the process supplies one through an environment variable.
