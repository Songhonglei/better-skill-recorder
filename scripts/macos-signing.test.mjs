import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_MACOS_SIGNING_IDENTITY,
  parseLocalSigningIdentity,
  shouldUseAdHocSignature,
} from "./macos-signing.mjs";

test("explicit preview and CI settings always request an ad-hoc signature", () => {
  assert.equal(shouldUseAdHocSignature({ CI: "true" }), true);
  assert.equal(shouldUseAdHocSignature({ CSC_IDENTITY_AUTO_DISCOVERY: "false" }), true);
  assert.equal(shouldUseAdHocSignature({ BETTER_SKILL_RECORDER_ALLOW_ADHOC: "1" }), true);
  assert.equal(shouldUseAdHocSignature({}), false);
});

test("finds the exact local macOS signing identity", () => {
  const hash = "BCFE18A3A936A19DA2DE1961B69C81D492583909";
  assert.equal(
    parseLocalSigningIdentity(
      `  1) ${hash} \"${LOCAL_MACOS_SIGNING_IDENTITY}\"\n     1 valid identities found`,
    ),
    hash,
  );
});

test("does not accept a different or malformed signing identity", () => {
  assert.equal(
    parseLocalSigningIdentity(
      '  1) BCFE18A3A936A19DA2DE1961B69C81D492583909 "Another App"',
    ),
    undefined,
  );
  assert.equal(
    parseLocalSigningIdentity(
      `invalid \"${LOCAL_MACOS_SIGNING_IDENTITY}\"`,
    ),
    undefined,
  );
});
