import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_MACOS_SIGNING_IDENTITY,
  parseLocalSigningIdentity,
} from "./macos-signing.mjs";

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
