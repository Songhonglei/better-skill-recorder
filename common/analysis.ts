import { z } from "zod";

/**
 * The structured result of the configured describer: a high-level **intent** plus an
 * ordered list of **actions/steps**, produced by the multi-turn agent and revised
 * from the user's natural-language feedback. This is the stable contract shared by
 * the agent's `submit_analysis` tool, the IPC surface, and on-disk persistence
 * (`analysis.json`). Kept separate from the deterministic `SessionBundle` (which is
 * the agent's *input*); this is the agent's *output*.
 */

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

/** One reconstructed action the user took, in order. */
export const AnalysisStepSchema = z.object({
  /** Stable id assigned by the agent (e.g. "s1"); used to target feedback. */
  id: z.string(),
  /** Short past-tense label addressed to the user, e.g. "Searched Google for 'interesting articles'". */
  title: z.string(),
  /**
   * 1–3 sentences of what happened and why it matters, in the past tense and
   * addressed to the user (verb-first, e.g. "Opened the technical guide."), not
   * the third person ("The user…").
   */
  detail: z.string(),
  /** Wall-clock epoch span (ms) this step covers, when known. */
  startMs: z.number().optional(),
  endMs: z.number().optional(),
  /** Apps involved (e.g. ["Microsoft Edge"]). */
  apps: z.array(z.string()).default([]),
  /** Free-text evidence refs the agent leaned on (events, urls, frame files). */
  evidence: z.array(z.string()).default([]),
  confidence: Confidence.default("medium"),
});
export type AnalysisStep = z.infer<typeof AnalysisStepSchema>;

/**
 * The payload the agent submits via the `submit_analysis` tool. The engine wraps
 * this into a full {@link Analysis} (adding sessionId/revision/timestamps/feedback).
 */
export const AnalysisSubmissionSchema = z.object({
  /** Short 2–5 word label for lists/menus, e.g. "Research habit articles". */
  title: z.string().default(""),
  /** The user's overall goal, e.g. "Submit an expense report". */
  intent: z.string(),
  intentConfidence: Confidence.default("medium"),
  /** Why the agent believes this is the intent (evidence-grounded), past tense, addressed to the user. */
  intentRationale: z.string().default(""),
  steps: z.array(AnalysisStepSchema).default([]),
});
export type AnalysisSubmission = z.infer<typeof AnalysisSubmissionSchema>;

/** One round of user feedback that was fed back into the session. */
export const FeedbackEntrySchema = z.object({
  /** The revision number this feedback produced. */
  revision: z.number().int(),
  at: z.number(),
  /** Natural-language feedback on the overall intent, if any. */
  overall: z.string().optional(),
  /** Per-step natural-language notes. */
  steps: z
    .array(z.object({ stepId: z.string(), note: z.string() }))
    .default([]),
});
export type FeedbackEntry = z.infer<typeof FeedbackEntrySchema>;

/** The full, persisted analysis for a session. */
export const AnalysisSchema = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  /** Bumped on every (re)analysis; revision 1 is the first pass. */
  revision: z.number().int(),
  createdAt: z.number(),
  /** Narration file version available when this analysis turn started. */
  narrationSourceUpdatedAt: z.number().nullable().default(null),
  /** Short 2–5 word label for lists/menus. Empty on analyses saved before titles existed. */
  title: z.string().default(""),
  intent: z.string(),
  intentConfidence: Confidence,
  intentRationale: z.string(),
  steps: z.array(AnalysisStepSchema),
  /** Chronological log of feedback rounds applied so far. */
  feedbackLog: z.array(FeedbackEntrySchema).default([]),
  /** User has accepted this analysis as correct — the artifact a Skill is built from. */
  approved: z.boolean().default(false),
  /** When the user approved it (epoch ms). */
  approvedAt: z.number().optional(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/** Feedback the UI sends for a re-analysis round. */
export interface AnalysisFeedback {
  /** NL feedback on the overall intent. */
  overall?: string;
  /** Per-step NL notes (only steps the user commented on). */
  steps: { stepId: string; note: string }[];
}

/** Build a full Analysis from an agent submission + engine-managed fields. */
export function toAnalysis(
  sessionId: string,
  revision: number,
  submission: AnalysisSubmission,
  feedbackLog: FeedbackEntry[],
  narrationSourceUpdatedAt: number | null,
): Analysis {
  return AnalysisSchema.parse({
    version: 1,
    sessionId,
    revision,
    createdAt: Date.now(),
    narrationSourceUpdatedAt,
    title: submission.title,
    intent: submission.intent,
    intentConfidence: submission.intentConfidence,
    intentRationale: submission.intentRationale,
    steps: submission.steps,
    feedbackLog,
  });
}
