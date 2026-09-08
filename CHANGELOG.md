# Changelog

All notable user-facing changes are recorded here. The project follows Semantic Versioning
while it remains pre-1.0.

## Preview V0.1.0 — 2026-09-08

Internal version: `0.1.0-preview.1`. This starts the independent Better Skill Recorder
preview numbering; previous 0.5.0 builds were development builds based on the upstream version.

- Add advanced recording settings, short-recording discard, audio size checks, shortcut denylist and 30-day retention
- Harden renderer sandbox, trusted IPC, bounded audio reads and unfinished processing recovery
- Improve macOS permission diagnostics and recorder layout
- Publish a download and onboarding website with Chinese installation instructions

- Prepare a macOS Apple Silicon unsigned-preview release channel
- Replace the bundled Copilot runtime with user-configured OpenAI-compatible models
- Add preset and custom model configuration with secure API-key storage
- Add light and dark themes and streamlined language controls
- Add share-safe and personal Skill export modes
- Bundle verified English OCR data while excluding unused platform runtimes
- Refresh application identity, iconography, Skill wording, and export flows
- Limit the current build and CI scope to macOS ARM64

## 0.5.0

First Better Skill Recorder preview based on the upstream Skill Recorder project.
