import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  macOSWindowArguments,
  resolveMacOSWindowBinaryPath,
} from "./macos-active-window";

test("packaged macOS window helper resolves outside app.asar", () => {
  assert.equal(
    resolveMacOSWindowBinaryPath(() =>
      "/Applications/Better Skill Recorder.app/Contents/Resources/app.asar/node_modules/get-windows/index.js"
    ),
    "/Applications/Better Skill Recorder.app/Contents/Resources/app.asar.unpacked/node_modules/get-windows/main",
  );
});

test("development macOS window helper path stays unchanged", () => {
  assert.equal(
    resolveMacOSWindowBinaryPath(() => "/workspace/node_modules/get-windows/index.js"),
    "/workspace/node_modules/get-windows/main",
  );
});

test("installed get-windows entrypoint resolves to a real helper", {
  skip: process.platform !== "darwin",
}, () => {
  assert.equal(existsSync(resolveMacOSWindowBinaryPath()), true);
});

test("degraded macOS window lookup disables permission-gated fields", () => {
  assert.deepEqual(
    macOSWindowArguments({
      accessibilityPermission: false,
      screenRecordingPermission: false,
    }),
    ["--no-accessibility-permission", "--no-screen-recording-permission"],
  );
  assert.deepEqual(
    macOSWindowArguments({
      accessibilityPermission: true,
      screenRecordingPermission: true,
    }),
    [],
  );
});
