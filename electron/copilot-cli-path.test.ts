import assert from "node:assert/strict";
import test from "node:test";

import { executablePathForSpawn } from "./copilot-cli-path";

test("packaged Copilot executables resolve outside app.asar", () => {
  assert.equal(
    executablePathForSpawn(
      "/Applications/Better Skill Recorder.app/Contents/Resources/app.asar/node_modules/@github/copilot-darwin-arm64/copilot",
    ),
    "/Applications/Better Skill Recorder.app/Contents/Resources/app.asar.unpacked/node_modules/@github/copilot-darwin-arm64/copilot",
  );
});

test("development and already-unpacked executable paths stay unchanged", () => {
  assert.equal(
    executablePathForSpawn(
      "/workspace/node_modules/@github/copilot-darwin-arm64/copilot",
    ),
    "/workspace/node_modules/@github/copilot-darwin-arm64/copilot",
  );
  assert.equal(
    executablePathForSpawn(
      "/Applications/App.app/Contents/Resources/app.asar.unpacked/node_modules/copilot",
    ),
    "/Applications/App.app/Contents/Resources/app.asar.unpacked/node_modules/copilot",
  );
});

test("Windows packaged executable paths are converted too", () => {
  assert.equal(
    executablePathForSpawn(
      "C:\\Program Files\\Better Skill Recorder\\resources\\app.asar\\node_modules\\@github\\copilot-win32-x64\\copilot.exe",
    ),
    "C:\\Program Files\\Better Skill Recorder\\resources\\app.asar.unpacked\\node_modules\\@github\\copilot-win32-x64\\copilot.exe",
  );
});
