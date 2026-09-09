import type { TierMove } from "./selector";

/**
 * The event stream exists to answer exactly two questions (design doc #7):
 *   1. Does the pause actually unstick people?  (pause -> next-attempt-correct)
 *   2. Does the loop survive its own novelty?   (session 1 vs session 5 length)
 *
 * Everything logged here serves one of those, or is needed to interpret them.
 * Per-question latency deliberately excludes time spent inside a pause; pause
 * duration is its own span.
 */

export type GameEvent =
  | { type: "session_start"; ts: number }
  | { type: "session_end"; ts: number; answered: number; correct: number; xp: number }
  | { type: "question_served"; ts: number; questionId: string; tier: number }
  | {
      type: "answer_submitted";
      ts: number;
      questionId: string;
      /** Carried on the event so mastery can be folded up without a lookup. */
      tier: number;
      verdict: "correct" | "incorrect";
      misconceptionId?: string;
      /** Time on this attempt, excluding any pause. */
      latencyMs: number;
      afterPause: boolean;
    }
  | { type: "unreadable_input"; ts: number; questionId: string }
  | { type: "notation_help_shown"; ts: number; questionId: string }
  | {
      type: "pause_invoked";
      ts: number;
      questionId: string;
      trigger: "manual" | "offered";
    }
  | { type: "hint_rung"; ts: number; questionId: string; rung: number }
  | {
      type: "tutor_replied";
      ts: number;
      questionId: string;
      rung: number;
      /** Whether the first reply leaked and the retry stood in. */
      retried: boolean;
    }
  /**
   * The headline quality metric. A rising fallback rate means the prompt is
   * leaking, the provider is flaking, or the quota is too tight — and which of
   * those it is has to be readable from the log, so the reason is carried
   * rather than collapsed into a boolean.
   */
  | {
      type: "tutor_fallback";
      ts: number;
      questionId: string;
      rung: number;
      reason: "leak" | "provider-error" | "timeout" | "not-configured" | "quota";
    }
  | { type: "solution_revealed"; ts: number; questionId: string }
  | {
      type: "pause_ended";
      ts: number;
      questionId: string;
      durationMs: number;
      reachedRung: number;
    }
  | {
      type: "tier_move";
      ts: number;
      from: number;
      to: number;
      move: TierMove;
    };

export type GameEventType = GameEvent["type"];
