# Release Better Skill Recorder

The current release channel is a **macOS Apple Silicon unsigned preview**. Do not describe
it as signed, notarized, verified by Apple, or suitable for managed production devices.

## 1. Prepare the release commit

Start from `main` with a clean working tree. Update the semantic version in
`package.json` and `package-lock.json`:

```bash
npm version 0.1.0-preview.1 --no-git-tag-version
```

Update `CHANGELOG.md`, screenshots, README compatibility notes, model presets, and
third-party notices when relevant.

## 2. Verify the toolchain

Required release toolchain:

- Node.js `>=24.19.0 <25`
- npm `>=11.17.0`
- Apple Silicon macOS runner or build machine

The npm minimum is intentional. Release installation uses npm's install-script allowlist
enforcement so an unreviewed dependency lifecycle script cannot silently execute.

```bash
node --version
npm --version
npm run check:lockfile
```

Do not bypass or weaken the install-script policy to make a release.

## 3. Install and validate

```bash
npm ci --ignore-scripts=false --dangerously-allow-all-scripts=false --strict-allow-scripts
npm run assets:prepare
npm run compliance:prepare
npm run typecheck
npm run typecheck:evals
npm test
npm run build
npm audit --omit=dev
```

Review dependency and lockfile changes, `package.json#allowScripts`, the generated license
inventory, third-party notices, and every new model, image, font, native binary, and copied
source file. The English OCR model must match the commit and SHA-256 pinned in
`third_party/compliance-policy.json`.

## 4. Build the unsigned preview

Build on Apple Silicon and explicitly disable identity discovery:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:portable:mac
shasum -a 256 release/*.zip | tee release/SHA256SUMS.txt
```

Verify the app and expected preview status:

```bash
codesign --verify --deep --strict --verbose=2 \
  "release/mac-arm64/Better Skill Recorder.app"
spctl --assess --type execute --verbose=4 \
  "release/mac-arm64/Better Skill Recorder.app" || true
```

`codesign --verify` should accept the internal ad-hoc signature. `spctl` is expected to
reject the preview because it has no Apple Developer ID and notarization ticket.

## 5. Clean-machine acceptance test

Test the exact ZIP on a Mac without existing Better Skill Recorder state:

1. Verify SHA-256 and follow the documented Gatekeeper **Open Anyway** flow
2. Grant Screen Recording and optionally Microphone access
3. Configure a model and test the connection
4. Record a short browser workflow
5. Analyze with visual analysis on and off
6. Export both share-safe and personal Skills
7. Confirm the share-safe package contains no API key, local absolute path, or local ID
8. Replace the app with the candidate again and verify settings and sessions survive

Also test invalid API keys, unreachable endpoints, unsupported model capabilities,
cancelled analysis, and denied macOS permissions.

## 6. Tag and publish

Production releases require CI and the clean-machine test. An explicitly labeled
prerelease may be shared for external acceptance testing after local checks pass;
its notes must disclose which clean-machine tests are still pending:

```bash
release_commit="$(git rev-parse HEAD)"
git tag -a v0.1.0-preview.1 "$release_commit" -m "Preview V0.1.0"
git push origin HEAD:main refs/tags/v0.1.0-preview.1
```

Attach the macOS ARM64 ZIP and `SHA256SUMS.txt`. The app includes version-matched
license notices, immutable upstream source URLs, hashes and build instructions in
`Contents/Resources/compliance`; the current network-source policy does not require a
separate `compliance-sources.zip`. Never substitute a licenses-only bundle.
Release notes must prominently state **Unsigned Preview — not notarized by
Apple**, Apple Silicon only, the exact commit and checksum, model requirements, known
limitations, and a link to `INSTALL.md`.

Never silently replace an asset or move a published tag. Publish a new patch version.

## 7. Future Developer ID release

Before removing the unsigned-preview warning, implement and verify:

- Apple Developer Program membership
- Developer ID Application certificate and protected CI secret
- Hardened Runtime and least-privilege entitlements
- notarization with `notarytool` and ticket stapling
- `spctl` acceptance on a clean Mac

The local certificate created by `npm run setup:signing:mac` cannot be used for this.
