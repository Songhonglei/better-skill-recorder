import type { Collector, CollectorContext } from "../recorder/collector";
import { createUrlProvider, type UrlProvider } from "./url-provider";
import type { ActiveWindowResult } from "./window-info";
import { readMacOSActiveWindow } from "./macos-active-window";

/** Base cadence for app/title polling. Browsers poll slower (see below). */
const POLL_MS = 1000;
/**
 * When a browser is frontmost we poll get-windows *less* often: its native
 * binary does its own Apple Events URL round-trip to the browser on every call,
 * which — at a fast cadence — makes the browser's UI stutter. We fetch the URL
 * ourselves, throttled and on-change, so a slow get-windows cadence here is pure
 * win (we only need it to notice when you switch away).
 */
const POLL_MS_BROWSER = 1600;
/** Minimum spacing between URL reads while a browser stays frontmost (SPA navs). */
const URL_MIN_INTERVAL_MS = 1500;

/** get-windows options for each capture mode. */
const FULL = { accessibilityPermission: true, screenRecordingPermission: true } as const;
const DEGRADED = { accessibilityPermission: false, screenRecordingPermission: false } as const;
const GET_WINDOWS_PACKAGE = "get-windows";

interface GetWindowsModule {
  activeWindow(options: typeof FULL | typeof DEGRADED): Promise<ActiveWindowResult | undefined>;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

export interface ActiveWindowOptions {
  captureTitles: boolean;
  captureUrls: boolean;
}

/**
 * Polls the foreground window via get-windows and emits:
 *   - `app.activate`      when the frontmost application changes
 *   - `app.title-change`  when only the window title changes (same app)
 *   - `browser.url`       when the active browser tab URL changes
 *
 * App switches and titles come from get-windows (cross-platform). URLs come from
 * a dedicated {@link UrlProvider} (macOS AppleScript today; Windows UIA later),
 * invoked **only** when a browser is frontmost and something changed — keeping
 * the permission-gated, comparatively slow URL read off the hot path so it never
 * blocks polling or hammers the browser.
 *
 * On macOS full title/URL data needs Accessibility + Screen Recording; URLs
 * additionally need a one-time per-browser Automation grant. Everything degrades
 * gracefully to app-switch tracking when a grant is absent.
 */
export class ActiveWindowCollector implements Collector {
  readonly name = "active-window";
  private timer: NodeJS.Timeout | null = null;
  private ctx: CollectorContext | null = null;
  private mode: "full" | "degraded";
  private readonly captureTitles: boolean;
  private readonly captureUrls: boolean;
  private readonly urlProvider: UrlProvider | null;
  private warned = false;
  private polling = false;

  private lastApp = "";
  private lastTitle = "";
  private lastUrl = "";
  private currentIsBrowser = false;
  private urlInFlight = false;
  private lastUrlAt = 0;

  constructor(opts: ActiveWindowOptions) {
    this.captureTitles = opts.captureTitles;
    this.captureUrls = opts.captureUrls;
    this.mode = opts.captureTitles || opts.captureUrls ? "full" : "degraded";
    this.urlProvider = opts.captureUrls ? createUrlProvider() : null;
  }

  start(ctx: CollectorContext): void {
    this.ctx = ctx;
    if (this.captureUrls && !this.urlProvider) {
      // Honest degradation: the level asks for URLs but this platform has no
      // provider (e.g. Linux). Say so once instead of silently emitting nothing.
      ctx.log.warn("Browser URL capture is on but unavailable on this platform; skipping URLs.");
    }
    void this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.urlProvider?.dispose?.();
    this.ctx = null;
  }

  private scheduleNext(): void {
    if (!this.ctx) return;
    const delay = this.currentIsBrowser ? POLL_MS_BROWSER : POLL_MS;
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private async readPlatform(): Promise<ActiveWindowResult | undefined> {
    if (process.platform === "darwin") {
      return readMacOSActiveWindow(this.mode === "full" ? FULL : DEGRADED);
    }
    if (process.platform === "win32") {
      const { readWindowsActiveWindow } = await import("./windows-active-window");
      return readWindowsActiveWindow();
    }
    const { activeWindow } = await import(GET_WINDOWS_PACKAGE) as GetWindowsModule;
    return activeWindow(this.mode === "full" ? FULL : DEGRADED);
  }

  private async read(): Promise<ActiveWindowResult | undefined> {
    try {
      return await this.readPlatform();
    } catch (err) {
      if (process.platform !== "win32" && this.mode === "full") {
        this.mode = "degraded";
        this.ctx?.log.warn(
          "Reduced capture: window titles/URLs need a screen-capture / accessibility permission.",
        );
        return this.readPlatform();
      }
      throw err;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling || !this.ctx) return;
    this.polling = true;
    try {
      const win = await this.read();
      if (win) this.process(win);
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        this.ctx?.log.warn("activeWindow failed:", err instanceof Error ? err.message : err);
      }
    } finally {
      this.polling = false;
      this.scheduleNext();
    }
  }

  private process(win: ActiveWindowResult): void {
    if (!this.ctx) return;
    const owner = (win.owner ?? {}) as {
      name?: string;
      processId?: number;
      path?: string;
      bundleId?: string;
    };
    const app = owner.name || "unknown";
    const title = this.captureTitles ? (win.title ?? "") : "";
    const bounds = win.bounds as Bounds | undefined;

    const appChanged = app !== this.lastApp;
    const titleChanged = !!title && title !== this.lastTitle;

    if (appChanged) {
      // New foreground context — allow the URL to re-emit for this app/step.
      this.lastUrl = "";
      this.ctx.publish("app.activate", {
        app,
        title,
        ...(bounds ? { bounds } : {}),
        ...(owner.bundleId ? { bundleId: owner.bundleId } : {}),
        ...(owner.processId ? { pid: owner.processId } : {}),
        ...(owner.path ? { path: owner.path } : {}),
      });
    } else if (this.captureTitles && titleChanged) {
      this.ctx.publish("app.title-change", { app, title });
    }

    this.currentIsBrowser = this.urlProvider?.supports(app) ?? false;
    if (this.captureUrls && this.currentIsBrowser) {
      const now = Date.now();
      if (!this.urlInFlight && (appChanged || titleChanged || now - this.lastUrlAt >= URL_MIN_INTERVAL_MS)) {
        this.fetchUrl(app);
      }
    }

    this.lastApp = app;
    this.lastTitle = title;
  }

  /** Fire-and-forget URL read: never awaited by the poll loop. */
  private fetchUrl(app: string): void {
    if (!this.urlProvider) return;
    this.urlInFlight = true;
    this.lastUrlAt = Date.now();
    void this.urlProvider
      .get(app)
      .then((res) => {
        if (!this.ctx || !res?.url || res.url === this.lastUrl) return;
        this.lastUrl = res.url;
        const host = safeHost(res.url);
        this.ctx.publish("browser.url", {
          app,
          url: res.url,
          ...(host ? { host } : {}),
          ...(res.title ? { title: res.title } : {}),
        });
      })
      .catch(() => {})
      .finally(() => {
        this.urlInFlight = false;
      });
  }
}
