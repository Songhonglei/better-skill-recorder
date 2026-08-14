# OpenAI-compatible source preview (Phases 2–3)

Phase 2 added text-only Analyze and feedback. Phase 3 adds default-on frame/image
analysis plus Skill Builder and Automation Builder through the same OpenAI-compatible
Chat Completions endpoint. GitHub Copilot remains the default. The installed
`Skill Recorder (Source)` launcher is unchanged and continues to run the official
Microsoft revision until the fork is installed explicitly.

## Temporary configuration

There is intentionally no Settings UI or persisted credential in this preview. Start
the fork from this source checkout with these process-only values:

```bash
export SKILL_RECORDER_AGENT_PROVIDER=openai-compatible
export SKILL_RECORDER_OPENAI_BASE_URL=https://your-endpoint.example/v1
export SKILL_RECORDER_MODEL=your-model
# Vision is on by default. Set false only for a text-only model:
# export SKILL_RECORDER_OPENAI_VISION=false
read -s SKILL_RECORDER_OPENAI_API_KEY
export SKILL_RECORDER_OPENAI_API_KEY
npm start
unset SKILL_RECORDER_OPENAI_API_KEY
```

For an unauthenticated loopback server, omit the API-key variable. Plain HTTP is
accepted only for `localhost`, `127.0.0.1`, or `::1`; remote endpoints require
HTTPS. URLs containing credentials, queries, or fragments are rejected.

The app reads the API key once into its in-memory runtime factory and removes it from its
own process environment. It is not written to application data, recordings,
logs, debug bundles, or repository files. The parent shell still owns any shell
variable it exported, so unset it after the app exits as shown above.

`SKILL_RECORDER_OPENAI_VISION` defaults to true because recordings are primarily
visual. Analyze may call `get_frames`; returned JPEGs are attached to the next
Chat Completions turn as inline `image_url` data. Set it to `false` when the
selected endpoint or model is text-only. Accepted values are
`true/false`, `1/0`, `yes/no`, and `on/off`.

## Current preview scope

Supported:

- initial recording Analyze;
- feedback in the same multi-turn conversation;
- default-on screen-frame analysis, with an explicit text-only opt-out;
- Skill plan proposal, refinement, and final `SKILL.md` generation;
- Automation plan proposal, refinement, and deterministic export;
- Chat Completions function/tool calling;
- sequential text tool results;
- validated `submit_analysis` completion and two repair attempts;
- cancellation, total-run deadline, and session disposal; and
- exact tool allowlisting.

Deferred to later phases:

- Settings UI and OS credential storage;
- endpoint capability probing; and
- Responses API support.

To return to Copilot, unset `SKILL_RECORDER_AGENT_PROVIDER` (and the optional
vision flag) or set the provider to `copilot` before launching the fork.

## Verify vision end to end

Automated protocol and workflow coverage:

```bash
npm test
```

The test named `vision-enabled runtime forwards inline image tool results` checks
that a frame result becomes a `data:image/...;base64,...` `image_url` input on the
next model request. The Analyze fixture also checks the negative path: when vision
is explicitly disabled, `list_frames` and `get_frames` are not exposed at all.

For a real endpoint, use this positive/negative control:

1. Choose a vision-capable model and leave `SKILL_RECORDER_OPENAI_VISION` unset.
2. Record a short page containing a unique phrase visible only inside the page
   body. Do not put the phrase in the URL, window title, clipboard, or narration.
3. Analyze it. The progress UI should show `Looking at ...` followed by
   `Attached N frame image(s) ...`, and the analysis should correctly identify the
   visible-only phrase or action.
4. Repeat with `SKILL_RECORDER_OPENAI_VISION=false`. Those frame progress messages
   must disappear and the visible-only detail should no longer be available.

For a local endpoint or request-inspection proxy, the strongest wire-level check
is that the request after `get_frames` contains a user content part whose type is
`image_url` and whose URL begins with `data:image/jpeg;base64,`. Never retain these
request bodies in normal logs because they contain captured screen content.
