# Security policy

## Supported versions

Security fixes are provided for the latest GitHub release. Preview binaries are unsigned
and not notarized; verify the published SHA-256 before opening them.

## Report a vulnerability

Do not disclose vulnerabilities, credentials, private recordings, or exploit details in a
public issue. Use GitHub's **Report a vulnerability** form in the repository Security tab.
Include the affected version, macOS version, reproduction steps, impact, and the smallest
safe diagnostic material required.

If private vulnerability reporting is not enabled, contact the repository owner privately
through their GitHub profile and ask for a secure reporting channel without including the
vulnerability details in the first message.

This fork is independently maintained. Microsoft and model providers do not receive or
triage its security reports.

## Renderer sandbox

Every application renderer runs with Electron's Chromium sandbox, context isolation, and
Node integration disabled. File-system and credential operations stay in the main process
and are exposed only through narrowly scoped IPC handlers.

This is Electron's renderer sandbox. The GitHub-distributed app does not currently enable
Apple's separate `com.apple.security.app-sandbox` entitlement. That entitlement is mainly
required for Mac App Store distribution and would need a separate capability and file-access
design for screen capture, Accessibility metadata, arbitrary export locations, local model
files, and configuration-file access.

The sandbox is a build-time security boundary, not a user preference. Do not launch the
app with `--no-sandbox` and do not ask users to disable the sandbox. If a feature fails only
in a packaged build, report the app version, macOS version, affected feature, and exact
reproduction steps so the privileged operation can be moved behind an appropriate IPC
boundary.

Maintainers can verify the source boundary with:

```bash
nvm use
npm run check:sandbox
npm test
npm run dist:app:mac
```

`check:sandbox` fails if a BrowserWindow disables the renderer sandbox, if a sandboxed
audio preload imports Node file-system APIs, or if the development launcher adds a sandbox
disable flag. A packaged smoke test should additionally exercise screen recording,
microphone narration, analysis with and without visual input, configuration-file actions,
and both personal and share-safe Skill export.
