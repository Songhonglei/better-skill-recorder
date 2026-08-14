import { execFileSync, spawn } from "node:child_process";

import type { CopilotSignInResult } from "../common/ipc";
import { resolveCopilotCliPath } from "./copilot-cli-path";
import { createLogger } from "./logger";

const log = createLogger("CopilotSignIn");

/** POSIX single-quoting so a path with spaces survives the shell the terminal opens. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The command that signs the user in — also shown in the UI as a manual fallback. */
export function copilotSignInCommand(cliPath: string): string {
  return process.platform === "win32" ? `"${cliPath}" login` : `${shellQuote(cliPath)} login`;
}

const LINUX_TERMINALS = [
  "x-terminal-emulator",
  "gnome-terminal",
  "konsole",
  "xfce4-terminal",
  "xterm",
];

function onPath(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Spawn a terminal and let it outlive the app; ENOENT arrives as an event, not a throw. */
function launch(file: string, args: string[], verbatim = false): void {
  const child = spawn(file, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    windowsVerbatimArguments: verbatim,
  });
  child.on("error", (err) => log.warn("terminal failed to start:", err.message));
  child.unref();
}

/**
 * Open a terminal window running `login` on the Copilot CLI that ships with the app.
 * Better Skill Recorder installs the CLI as a dependency, so telling users to run a global
 * `copilot` doesn't work — we hand them the bundled binary's full path instead.
 */
export function openCopilotSignIn(): CopilotSignInResult {
  const cliPath = resolveCopilotCliPath();
  if (!cliPath) {
    return {
      ok: false,
      error: "Better Skill Recorder couldn't find its bundled GitHub Copilot CLI. Reinstall the app.",
    };
  }
  const command = copilotSignInCommand(cliPath);
  try {
    if (process.platform === "win32") {
      // `start` gives the CLI its own console. The doubled quotes are cmd's required
      // form when the window title and the command are both quoted.
      launch("cmd.exe", ["/c", `start "Sign in to GitHub Copilot" cmd.exe /k "${command}"`], true);
    } else if (process.platform === "darwin") {
      const script = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(command)}\nend tell`;
      launch("osascript", ["-e", script]);
    } else {
      const terminal = LINUX_TERMINALS.find(onPath);
      if (!terminal) {
        return {
          ok: false,
          command,
          error: "No terminal emulator was found. Run the command below yourself, then try again.",
        };
      }
      launch(terminal, ["-e", "sh", "-c", `${command}; exec sh`]);
    }
    log.info("opened a terminal for the bundled CLI's login command");
    return { ok: true, command };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn("could not open a terminal:", error);
    return { ok: false, command, error };
  }
}
