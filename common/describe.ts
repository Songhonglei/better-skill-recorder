import type { SessionBundle, Step } from "./bundle";

/**
 * Deterministic, template-based narrative — the always-available baseline
 * describer. No LLM: it renders the validated bundle into a readable
 * `description.md`. The configured model (later) produces a richer narrative and
 * drives the opportunistic frame-probe loop, but this guarantees every session
 * yields a description even with no network or model endpoint.
 */

function fmtDur(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Offset from session start as `M:SS` (or `H:MM:SS`). */
function fmtOffset(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function uniq(values: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
}

function overview(b: SessionBundle): string {
  if (b.steps.length === 0) return "No activity was captured during this session.";
  const apps = uniq(b.steps.map((s) => s.app));
  const hosts = uniq(b.steps.flatMap((s) => s.hosts));
  const commandCount = b.steps.reduce((n, s) => n + s.commands.length, 0);
  const markerCount = b.steps.reduce((n, s) => n + s.markers.length, 0);

  const parts: string[] = [];
  parts.push(
    `Over ${fmtDur(b.session.durationMs)} the user moved through ${b.steps.length} step${
      b.steps.length === 1 ? "" : "s"
    }`,
  );
  if (apps.length) {
    const shown = apps.slice(0, 4).join(", ");
    parts.push(` across ${apps.length} app${apps.length === 1 ? "" : "s"} (${shown})`);
  }
  let text = parts.join("") + ".";
  if (hosts.length) text += ` Visited ${hosts.length} site${hosts.length === 1 ? "" : "s"}: ${hosts.slice(0, 6).join(", ")}.`;
  if (commandCount) text += ` Ran ${commandCount} terminal command${commandCount === 1 ? "" : "s"}.`;
  if (markerCount) text += ` Left ${markerCount} note${markerCount === 1 ? "" : "s"}.`;
  return text;
}

function stepDetails(s: Step): string[] {
  const out: string[] = [];
  if (s.urls.length) {
    out.push(`- Opened: ${s.urls.slice(0, 5).map((u) => `\`${u}\``).join(", ")}`);
  } else if (s.hosts.length) {
    out.push(`- Sites: ${s.hosts.join(", ")}`);
  }
  if (s.commands.length) {
    out.push(`- Commands: ${s.commands.map((c) => `\`${c}\``).join(", ")}`);
  }
  if (s.titles.length) {
    out.push(`- Windows: ${s.titles.slice(0, 5).join("; ")}`);
  }
  if (s.clipboardCount) {
    out.push(`- Clipboard changes: ${s.clipboardCount}`);
  }
  if (s.markers.length) {
    out.push(`- Notes: ${s.markers.map((m) => `“${m}”`).join("; ")}`);
  }
  if (s.frames.length) {
    out.push(`- Keyframes: ${s.frames.length}`);
  }
  return out;
}

/** Render a validated bundle into a Markdown description document. */
export function renderDescription(b: SessionBundle): string {
  const lines: string[] = [];
  const startedLabel = new Date(b.session.startedAt).toISOString().replace("T", " ").slice(0, 19);

  lines.push(`# Session recording — ${startedLabel} UTC`);
  lines.push("");

  const meta = [
    fmtDur(b.session.durationMs),
    `${b.stats.stepCount} step${b.stats.stepCount === 1 ? "" : "s"}`,
    `${b.stats.meaningfulEventCount} events`,
  ];
  if (b.stats.frameCount) meta.push(`${b.stats.frameCount} keyframes`);
  lines.push(`_${meta.join(" · ")}_`);
  lines.push("");

  lines.push("## Overview");
  lines.push(overview(b));
  lines.push("");

  lines.push("## Steps");
  if (b.steps.length === 0) {
    lines.push("");
    lines.push("_No activity captured._");
  }
  for (const s of b.steps) {
    const offset = fmtOffset(s.startMs - b.session.startedAt);
    lines.push("");
    lines.push(`### ${s.index + 1}. ${s.summary}`);
    const head = [`\`+${offset}\``, fmtDur(s.durationMs)];
    if (s.app) head.push(s.app);
    lines.push(head.join(" · "));
    for (const d of stepDetails(s)) lines.push(d);
  }

  lines.push("");
  return lines.join("\n");
}
