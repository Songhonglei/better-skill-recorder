import { execFile } from "node:child_process";

import { WindowsUrlProvider } from "./windows-url-provider";

/**
 * Reads the *active tab URL* of the frontmost browser — the single richest
 * non-video signal we can't get from window titles alone. macOS exposes it only
 * via AppleScript / Apple Events (a per-browser "Automation" grant), so this is
 * deliberately isolated behind a small interface:
 *   - it can be called **on demand** (only when a browser is frontmost and
 *     something changed) instead of on every poll, keeping Apple Events traffic
 *     to the browser — and the perceptible lag it causes — low;
 *   - a future Windows implementation (UI Automation address-bar read) or a
 *     macOS Accessibility implementation can slot in behind the same interface.
 */
export interface ActiveUrl {
  url: string;
  title?: string;
}

export interface UrlProvider {
  /** True when this provider can read a URL for the given frontmost app. */
  supports(app: string): boolean;
  /** Best-effort active-tab URL; resolves null on any failure (never throws). */
  get(app: string): Promise<ActiveUrl | null>;
  /** Release any long-lived resources (e.g. a helper process). Optional. */
  dispose?(): void;
}

// Browsers whose scripting dictionary exposes `active tab of front window`.
const CHROMIUM_BROWSERS = new Set<string>([
  "Google Chrome",
  "Google Chrome Canary",
  "Google Chrome Beta",
  "Google Chrome Dev",
  "Microsoft Edge",
  "Microsoft Edge Beta",
  "Microsoft Edge Dev",
  "Microsoft Edge Canary",
  "Brave Browser",
  "Brave Browser Beta",
  "Brave Browser Nightly",
  "Vivaldi",
  "Opera",
  "Opera GX",
  "Arc",
  "Chromium",
  "ego lite",
  "Yandex",
]);

// Browsers that use `front document` (WebKit/Safari scripting dictionary).
const WEBKIT_BROWSERS = new Set<string>(["Safari", "Safari Technology Preview"]);

export type BrowserEngine = "chromium" | "webkit";

/** Identify a frontmost app's scripting dialect, or null if it's not a browser. */
export function browserEngine(app: string): BrowserEngine | null {
  if (CHROMIUM_BROWSERS.has(app)) return "chromium";
  if (WEBKIT_BROWSERS.has(app)) return "webkit";
  return null;
}

export function isBrowserApp(app: string): boolean {
  return browserEngine(app) !== null;
}

const SEP = String.fromCharCode(30); // ASCII record separator, unlikely in URLs/titles

function chromiumScript(app: string): string {
  return (
    `tell application "${app}"\n` +
    `set _u to URL of active tab of front window\n` +
    `set _t to title of active tab of front window\n` +
    `return _u & (ASCII character 30) & _t\n` +
    `end tell`
  );
}

function webkitScript(app: string): string {
  return (
    `tell application "${app}"\n` +
    `set _u to URL of front document\n` +
    `set _t to name of front document\n` +
    `return _u & (ASCII character 30) & _t\n` +
    `end tell`
  );
}

function osascript(script: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: timeoutMs }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/**
 * macOS URL provider via AppleScript. Only ever invoked for allow-listed browser
 * apps, so the interpolated app name is trusted (no shell/AS injection surface).
 */
export class MacUrlProvider implements UrlProvider {
  supports(app: string): boolean {
    return isBrowserApp(app);
  }

  async get(app: string): Promise<ActiveUrl | null> {
    const engine = browserEngine(app);
    if (!engine) return null;
    const script = engine === "chromium" ? chromiumScript(app) : webkitScript(app);
    try {
      const out = await osascript(script);
      const [url, title] = out.replace(/\n+$/, "").split(SEP);
      if (!url || url === "missing value") return null;
      return { url: url.trim(), title: title?.trim() || undefined };
    } catch {
      // No front window, browser busy, or Automation permission not granted.
      return null;
    }
  }
}

/** The URL provider for the current platform, or null where unsupported. */
export function createUrlProvider(): UrlProvider | null {
  if (process.platform === "darwin") return new MacUrlProvider();
  if (process.platform === "win32") return new WindowsUrlProvider();
  return null;
}

/** How the active-tab URL is read on a given platform, for honest reporting. */
export type BrowserUrlKind = "applescript" | "uia" | "none";

export function browserUrlProviderKind(
  platform: NodeJS.Platform = process.platform,
): BrowserUrlKind {
  if (platform === "darwin") return "applescript";
  if (platform === "win32") return "uia";
  return "none";
}
