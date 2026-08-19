import { spawnSync } from "node:child_process";

export const LOCAL_MACOS_SIGNING_IDENTITY =
  "Better Skill Recorder Local Development";

export function parseLocalSigningIdentity(output) {
  const marker = `\"${LOCAL_MACOS_SIGNING_IDENTITY}\"`;
  const line = output
    .split("\n")
    .find((candidate) => candidate.includes(marker));
  return line?.match(/^\s*\d+\)\s+([0-9A-F]{40})\s+/u)?.[1];
}

export function findLocalSigningIdentity() {
  if (process.platform !== "darwin") return undefined;

  const result = spawnSync(
    "/usr/bin/security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return undefined;

  return parseLocalSigningIdentity(result.stdout);
}
