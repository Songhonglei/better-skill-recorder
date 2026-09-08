import { CAPTURE_SOURCES, FULL_CAPTURE } from "../common/config";
import type {
  ActiveWindowInfo,
  BrowserUrlInfo,
  DoctorReport,
  DoctorSource,
} from "../common/ipc";
import { browserUrlProviderKind } from "./collectors/url-provider";
import { sessionsRoot } from "./recorder/session-store";

function checkActiveWindow(): ActiveWindowInfo {
  if (process.platform === "darwin") {
    return { ok: true, provider: "macos-native", path: "macOS CoreGraphics" };
  }
  return {
    ok: false,
    provider: "missing",
    path: null,
    error: "This build supports macOS only.",
  };
}

function checkBrowserUrl(): BrowserUrlInfo {
  const kind = browserUrlProviderKind();
  return { kind, supported: kind !== "none" };
}

/** Whether a capture source can work at all on the current platform. */
function sourceSupport(key: string, browserUrl: BrowserUrlInfo): { supported: boolean; note?: string } {
  if (key === "browserUrls" && !browserUrl.supported) {
    return { supported: false, note: "Not available on this platform" };
  }
  return { supported: true };
}

/** Environment readiness check surfaced in the UI and (later) a CLI `doctor` command. */
export function runDoctor(): DoctorReport {
  const config = FULL_CAPTURE;
  const browserUrl = checkBrowserUrl();

  const activeSources: DoctorSource[] = CAPTURE_SOURCES.filter((s) => config[s.key]).map((s) => {
    const support = sourceSupport(s.key, browserUrl);
    return { key: s.key, label: s.label, tier: s.tier, cost: s.cost, supported: support.supported, note: support.note };
  });

  return {
    platform: process.platform,
    activeWindow: checkActiveWindow(),
    browserUrl,
    sessionsDir: sessionsRoot(),
    activeSources,
  };
}
