import assert from "node:assert/strict";
import test from "node:test";

import { browserEngine, isBrowserApp } from "./url-provider";

test("recognizes ego lite as a Chromium browser", () => {
  assert.equal(browserEngine("ego lite"), "chromium");
  assert.equal(isBrowserApp("ego lite"), true);
});

test("does not treat unrelated applications as browsers", () => {
  assert.equal(browserEngine("Better Skill Recorder"), null);
  assert.equal(isBrowserApp("Better Skill Recorder"), false);
});
