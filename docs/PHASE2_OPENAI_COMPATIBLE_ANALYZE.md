# Phase 2: OpenAI-compatible Analyze preview

Phase 2 adds a text-only Analyze and feedback path through an OpenAI-compatible
Chat Completions endpoint. GitHub Copilot remains the default. The installed
`Skill Recorder (Source)` launcher is unchanged and continues to run the official
Microsoft revision until the fork is installed explicitly.

## Temporary configuration

There is intentionally no Settings UI or persisted credential in Phase 2. Start
the fork from this source checkout with these process-only values:

```bash
export SKILL_RECORDER_AGENT_PROVIDER=openai-compatible
export SKILL_RECORDER_OPENAI_BASE_URL=https://your-endpoint.example/v1
export SKILL_RECORDER_MODEL=your-model
read -s SKILL_RECORDER_OPENAI_API_KEY
export SKILL_RECORDER_OPENAI_API_KEY
npm start
unset SKILL_RECORDER_OPENAI_API_KEY
```

For an unauthenticated loopback server, omit the API-key variable. Plain HTTP is
accepted only for `localhost`, `127.0.0.1`, or `::1`; remote endpoints require
HTTPS. URLs containing credentials, queries, or fragments are rejected.

The app reads the API key once into the Analyze runtime and removes it from its
own process environment. It is not written to application data, recordings,
logs, debug bundles, or repository files. The parent shell still owns any shell
variable it exported, so unset it after the app exits as shown above.

## Phase 2 scope

Supported:

- initial recording Analyze;
- feedback in the same multi-turn conversation;
- Chat Completions function/tool calling;
- sequential text tool results;
- validated `submit_analysis` completion and two repair attempts;
- cancellation, total-run deadline, and session disposal; and
- exact tool allowlisting.

Deferred to later phases:

- frame/image analysis;
- Skill Builder and Automation Builder custom-provider support;
- Settings UI and OS credential storage;
- endpoint capability probing; and
- Responses API support.

To return to Copilot, unset `SKILL_RECORDER_AGENT_PROVIDER` or set it to
`copilot` before launching the fork.
