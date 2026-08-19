import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findLocalSigningIdentity,
  LOCAL_MACOS_SIGNING_IDENTITY,
} from "./macos-signing.mjs";

const builder = fileURLToPath(
  new URL("../node_modules/electron-builder/out/cli/cli.js", import.meta.url),
);
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const args = process.argv.slice(2);
let temporaryConfig;

if (process.platform === "darwin") {
  const identityHash = findLocalSigningIdentity();
  const allowAdHoc =
    process.env.CI === "true" ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" ||
    process.env.BETTER_SKILL_RECORDER_ALLOW_ADHOC === "1";

  if (identityHash) {
    console.log(
      `Signing macOS build with ${LOCAL_MACOS_SIGNING_IDENTITY} (${identityHash.slice(0, 12)}…).`,
    );
    // A private local trust root has no public RFC 3161 timestamp service and
    // is intentionally used only on this Mac, so timestamping adds latency
    // without improving the signature's validity.
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const config = structuredClone(packageJson.build);
    config.mac.identity = LOCAL_MACOS_SIGNING_IDENTITY;
    config.mac.timestamp = "none";
    temporaryConfig = join(
      tmpdir(),
      `better-skill-recorder-builder-${process.pid}.json`,
    );
    writeFileSync(temporaryConfig, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
    });
    args.push("--config", temporaryConfig);
  } else if (allowAdHoc) {
    console.warn(
      "Local signing identity not found; using the explicitly allowed ad-hoc signature.",
    );
    args.push("--config.mac.identity=-");
  } else {
    console.error(
      `Missing macOS signing identity \"${LOCAL_MACOS_SIGNING_IDENTITY}\".\n` +
        "Run `npm run setup:signing:mac` once, or set " +
        "BETTER_SKILL_RECORDER_ALLOW_ADHOC=1 for an intentionally unstable ad-hoc build.",
    );
    process.exit(1);
  }
}

let result;
try {
  result = spawnSync(process.execPath, [builder, ...args], {
    env: process.env,
    stdio: "inherit",
  });
} finally {
  if (temporaryConfig) rmSync(temporaryConfig, { force: true });
}

if (result.error) throw result.error;
process.exit(result.status ?? 1);
