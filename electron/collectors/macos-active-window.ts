import childProcess from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

import { executablePathForSpawn } from "../executable-path";
import type { ActiveWindowResult } from "./window-info";

const require = createRequire(import.meta.url);
const execFile = promisify(childProcess.execFile);

export interface MacOSWindowOptions {
  accessibilityPermission: boolean;
  screenRecordingPermission: boolean;
}

/** Resolve get-windows' helper to its physical app.asar.unpacked location. */
export function resolveMacOSWindowBinaryPath(
  resolvePackageEntry: (id: string) => string = require.resolve,
): string {
  // get-windows does not export package.json, so resolve its public entrypoint
  // and walk to the sibling helper instead.
  const packageEntryPath = resolvePackageEntry("get-windows");
  return executablePathForSpawn(path.join(path.dirname(packageEntryPath), "main"));
}

export function macOSWindowArguments(options: MacOSWindowOptions): string[] {
  const args: string[] = [];
  if (!options.accessibilityPermission) args.push("--no-accessibility-permission");
  if (!options.screenRecordingPermission) args.push("--no-screen-recording-permission");
  return args;
}

/**
 * Read the active macOS window without importing get-windows' wrapper. Its
 * wrapper constructs the helper path inside app.asar and child_process then
 * fails with ENOTDIR in a packaged Electron application.
 */
export async function readMacOSActiveWindow(
  options: MacOSWindowOptions,
): Promise<ActiveWindowResult | undefined> {
  const binary = resolveMacOSWindowBinaryPath();
  const { stdout } = await execFile(binary, macOSWindowArguments(options));
  const parsed = JSON.parse(stdout) as ActiveWindowResult | null;
  return parsed ?? undefined;
}
