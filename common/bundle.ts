import { z } from "zod";

import { MEANINGFUL_EVENT_TYPES } from "./correlation";
import type { CorrelationResult } from "./correlation";
import type { RecEvent, SessionMeta } from "./types";

/**
 * The compact, self-contained artifact a describer consumes. It is the merge of
 * the (primary) non-video event stream and the (opportunistic) correlated frames,
 * cut into human-meaningful **steps**. Validated with zod so it is a stable
 * contract for both the baseline describer and the configured agent describer and
 * skill-conversion.
 */

/** Why a new step began — the boundary rule that fired. */
export const StepBoundary = z.enum(["start", "app-change", "url-change", "command"]);
export type StepBoundary = z.infer<typeof StepBoundary>;

export const StepSchema = z.object({
  index: z.number().int(),
  /** Wall-clock epoch (ms) the step began / ended. */
  startMs: z.number(),
  endMs: z.number(),
  durationMs: z.number(),
  boundary: StepBoundary,
  /** Dominant application during the step (if known). */
  app: z.string().optional(),
  titles: z.array(z.string()),
  hosts: z.array(z.string()),
  urls: z.array(z.string()),
  commands: z.array(z.string()),
  clipboardCount: z.number().int(),
  markers: z.array(z.string()),
  /** Seqs of the events folded into this step (stable ids). */
  eventSeqs: z.array(z.number().int()),
  /** Frame filenames correlated into this step's span. */
  frames: z.array(z.string()),
  /** Deterministic one-line label (filled by the segmenter). */
  summary: z.string(),
});
export type Step = z.infer<typeof StepSchema>;

export const SessionBundleSchema = z.object({
  version: z.literal(1),
  session: z.object({
    id: z.string(),
    startedAt: z.number(),
    stoppedAt: z.number().nullable(),
    durationMs: z.number(),
    platform: z.string(),
    appVersion: z.string(),
  }),
  steps: z.array(StepSchema),
  stats: z.object({
    eventCount: z.number().int(),
    meaningfulEventCount: z.number().int(),
    stepCount: z.number().int(),
    frameCount: z.number().int(),
    unexplainedFrameCount: z.number().int(),
    silentEventCount: z.number().int(),
  }),
});
export type SessionBundle = z.infer<typeof SessionBundleSchema>;

export interface BundleInput {
  meta: SessionMeta;
  events: readonly RecEvent[];
  /** Correlated frames + silent events, if a video was recorded. */
  correlation?: CorrelationResult | null;
}

// --- helpers (pure) --------------------------------------------------------

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;

function hostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

function pushUniq(arr: string[], v: string | undefined): void {
  if (v && !arr.includes(v)) arr.push(v);
}

/** The step whose [startMs, endMs) contains `t`, clamped to the ends. */
function stepForTime(steps: Step[], t: number): Step | undefined {
  if (steps.length === 0) return undefined;
  if (t < steps[0].startMs) return steps[0];
  for (const s of steps) {
    if (t >= s.startMs && t < s.endMs) return s;
  }
  return steps[steps.length - 1];
}

function summarizeStep(s: Step): string {
  const bits: string[] = [];
  if (s.app) bits.push(s.app);
  if (s.commands.length) {
    const shown = s.commands.slice(0, 2).map((c) => "`" + c + "`").join(", ");
    const extra = s.commands.length > 2 ? ` (+${s.commands.length - 2} more)` : "";
    bits.push(`ran ${shown}${extra}`);
  } else if (s.hosts.length) {
    bits.push(`on ${s.hosts.slice(0, 3).join(", ")}`);
  } else if (s.titles.length) {
    bits.push(`— ${s.titles[0]}`);
  }
  let label = bits.join(" ").trim() || "Activity";
  if (s.markers.length) label += ` — note: “${s.markers[0]}”`;
  return label;
}

interface MutableStep extends Step {}

/**
 * Merge the primary event stream (and opportunistic correlated frames) into
 * ordered steps and a validated bundle. Pure and deterministic. Step boundaries:
 * **app change**, **browser URL-host change**, or a **terminal command** — every
 * other meaningful event (title change, clipboard, marker, mac-URL on activate)
 * folds into the current step.
 */
export function buildBundle(input: BundleInput): SessionBundle {
  const { meta, events, correlation } = input;

  const meaningful = events
    .filter((e) => MEANINGFUL_EVENT_TYPES.has(e.type))
    .slice()
    .sort((a, b) => a.epoch - b.epoch);

  const steps: MutableStep[] = [];
  let cur: MutableStep | null = null;
  let curApp: string | undefined;
  let curHost: string | undefined;

  const openStep = (startMs: number, boundary: StepBoundary, app?: string): MutableStep => {
    const s: MutableStep = {
      index: steps.length,
      startMs,
      endMs: startMs,
      durationMs: 0,
      boundary,
      app,
      titles: [],
      hosts: [],
      urls: [],
      commands: [],
      clipboardCount: 0,
      markers: [],
      eventSeqs: [],
      frames: [],
      summary: "",
    };
    steps.push(s);
    return s;
  };

  for (const ev of meaningful) {
    const p = ev.payload;
    const app = str(p.app);
    const host = str(p.host) ?? hostFromUrl(str(p.url));

    let boundary: StepBoundary | null = null;
    if (!cur) boundary = "start";
    else if (ev.type === "app.activate" && app && app !== curApp) boundary = "app-change";
    else if (ev.type === "browser.url" && host && host !== curHost) boundary = "url-change";
    else if (ev.type === "terminal.command") boundary = "command";

    if (boundary) cur = openStep(ev.epoch, boundary, app ?? curApp);

    if (app) curApp = app;
    if (host) curHost = host;

    const step = cur!;
    step.eventSeqs.push(ev.seq);
    if (app && !step.app) step.app = app;

    switch (ev.type) {
      case "app.activate":
        pushUniq(step.titles, str(p.title));
        pushUniq(step.urls, str(p.url));
        pushUniq(step.hosts, host);
        break;
      case "app.title-change":
        pushUniq(step.titles, str(p.title));
        break;
      case "browser.url":
        pushUniq(step.hosts, host);
        pushUniq(step.urls, str(p.url));
        pushUniq(step.titles, str(p.title));
        break;
      case "terminal.command":
        pushUniq(step.commands, str(p.command));
        break;
      case "clipboard.change":
        step.clipboardCount++;
        break;
      case "marker": {
        const note = str(p.note);
        if (note) step.markers.push(note);
        break;
      }
      default:
        break;
    }
  }

  // Close each step's span: it ends where the next begins (or at session stop).
  const lastEpoch = meaningful.length ? meaningful[meaningful.length - 1].epoch : meta.startedAt;
  const stopEpoch = meta.stoppedAt ?? lastEpoch;
  for (let i = 0; i < steps.length; i++) {
    steps[i].endMs = i + 1 < steps.length ? steps[i + 1].startMs : Math.max(steps[i].startMs, stopEpoch);
    steps[i].durationMs = steps[i].endMs - steps[i].startMs;
  }

  // Attach opportunistic frames to their enclosing step.
  const frames = correlation?.frames ?? [];
  let unexplained = 0;
  for (const f of frames) {
    if (f.unexplained) unexplained++;
    const s = stepForTime(steps, f.tMs);
    if (s) pushUniq(s.frames, f.file);
  }

  for (const s of steps) s.summary = summarizeStep(s);

  const bundle: SessionBundle = {
    version: 1,
    session: {
      id: meta.id,
      startedAt: meta.startedAt,
      stoppedAt: meta.stoppedAt,
      durationMs: Math.max(0, stopEpoch - meta.startedAt),
      platform: String(meta.platform),
      appVersion: meta.appVersion,
    },
    steps,
    stats: {
      eventCount: events.length,
      meaningfulEventCount: meaningful.length,
      stepCount: steps.length,
      frameCount: frames.length,
      unexplainedFrameCount: unexplained,
      silentEventCount: correlation?.silentEvents.length ?? 0,
    },
  };

  return SessionBundleSchema.parse(bundle);
}
