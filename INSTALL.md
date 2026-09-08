# Install Better Skill Recorder

[中文安装与使用说明](docs/GETTING_STARTED.zh-CN.md) · [Project website](https://songhonglei.github.io/better-skill-recorder/)

The current preview supports **Apple Silicon Macs only**. It does not provide Windows,
Linux, or Intel Mac packages.

## Unsigned preview warning

The GitHub preview is ad-hoc signed and is not notarized by Apple. Gatekeeper therefore
cannot verify the developer identity or confirm that Apple scanned the app for known
malware. Only continue when all of these are true:

- the ZIP came from this repository's GitHub Release page
- its SHA-256 matches the checksum published with that release
- you accept the additional risk of running an unnotarized preview

Managed Macs may prevent users from overriding Gatekeeper. Contact the device
administrator rather than weakening system security.

## Download and verify

1. Open [Preview V0.1.0](https://github.com/Songhonglei/better-skill-recorder/releases/tag/v0.1.0-preview.1)
2. Download the macOS ARM64 ZIP and `SHA256SUMS.txt`
3. In Terminal, calculate the ZIP checksum:

   ```bash
   shasum -a 256 "/path/to/Better-Skill-Recorder-0.1.0-preview.1-macOS-arm64-unsigned-preview.zip"
   ```

4. Compare every character with the release checksum
5. Do not open the archive if the values differ

## Install and allow once

1. Double-click the verified ZIP
2. Move **Better Skill Recorder.app** to `/Applications`
3. Open the app once from Finder
4. If macOS blocks it, open **System Settings → Privacy & Security**
5. Scroll to **Security**, select **Open Anyway**, then confirm **Open**
6. Enter the Mac login password if requested

The exception applies to that app. Do not disable Gatekeeper globally. Apple's official
instructions are available at:
https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac

## Permissions

The app requests only the permissions needed for enabled features:

- **Screen & System Audio Recording** — records the selected display; system audio is not
  included
- **Accessibility** — reads active application and browser context where macOS requires it
- **Microphone** — requested only when narration is enabled

After granting Screen Recording, quit and reopen the app. If an upgrade stops capturing,
remove only this app's old permission entry, re-add the current app from `/Applications`,
enable its permission, then relaunch it. Ad-hoc preview updates may require reauthorization.
Browser URL collection may separately request Automation permission. Do not reset the
whole keychain or other apps' permissions.

## Configure a model

On first use, open **Model management** and configure an OpenAI-compatible endpoint.
Choose a preset or enter a custom model ID, provide its BaseURL and API key, test the
connection, then save and enable it.

The API key is encrypted using Electron `safeStorage`, backed by the macOS login keychain.
The JSON configuration contains model metadata and may reference an environment-variable
name, but should not contain the plaintext API key.

## Update

There is no automatic updater yet. For each release:

1. Download and verify the new ZIP
2. Quit Better Skill Recorder
3. Replace the app in `/Applications`
4. Open it and confirm existing sessions and model settings are available

Never replace an installed app with an archive from an untrusted mirror.

## Uninstall

1. Quit Better Skill Recorder
2. Move `/Applications/Better Skill Recorder.app` to Trash

To remove local sessions and settings as well, remove the `skill-recorder` directory
under `~/Library/Application Support/`. Review and back up its contents first because this
removes recordings, analyses, generated Skills, configuration, and cached models.

The encrypted API-key file is stored with application data, while decryption is tied to the
macOS keychain. Removing application data does not damage the login keychain.

## Renderer sandbox

The application enables Electron's renderer sandbox automatically. Users do not need to
configure or disable it. Screen recording, microphone narration, model access, local OCR,
file export, and opening the configuration file are implemented through the main process
and should continue to work with the sandbox enabled.

Do not add `--no-sandbox` when launching the app. If a feature does not work, open a GitHub
issue with the app version, macOS version, affected feature, and reproduction steps instead
of weakening the app's security boundary.

## Build from source

Use Node.js `>=24.19.0 <25` and npm `>=11.17.0`:

```bash
npm ci --ignore-scripts=false --dangerously-allow-all-scripts=false --strict-allow-scripts
npm run assets:prepare
npm run compliance:licenses
npm run dev
```

Create an unsigned ARM64 preview ZIP:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:portable:mac
shasum -a 256 release/*.zip
```

The build downloads the reviewed English OCR model from a commit-pinned upstream URL,
verifies its SHA-256, and embeds it in the app. Release builds also generate the matching
third-party compliance material.

## Maintainer-only local signing

`npm run setup:signing:mac` creates a stable, machine-local development certificate to
reduce repeated permission prompts during development. That certificate is not an Apple
Developer ID, is not trusted on other Macs, and must not be presented as a public signature.

Public distribution under default Gatekeeper settings requires an Apple-issued Developer
ID certificate, Hardened Runtime, notarization, and stapling. See [RELEASING.md](RELEASING.md).
