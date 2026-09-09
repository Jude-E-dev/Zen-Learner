import type { Question } from "../content/schema";
import { checkAnswer, type CheckResult } from "../equivalence/check";
import type { GameEvent } from "./events";
import {
  applyVerdict,
  initialSelector,
  markServed,
  selectQuestion,
  type SelectorState,
} from "./selector";

/**
 * The Zen loop.
 *
 * A continuous stream, not a quiz with an end. No timers anywhere: speed is
 * never measured against the learner, because the fantasy is focused calm.
 *
 *   grinding ──submit correct──> feedback ──next──> grinding
 *      │  ^                                            │
 *      │  └──────────── resume ──────────────┐         │
 *      │                                     │         │
 *      ├──submit wrong (x2)──> pause offered ┤         │
 *      └──"I'm stuck"────────> paused ───────┘         │
 *                                │                     │
 *                          rung 3 spent                │
 *                                v                     │
 *                            revealed ─────────────────┘
 *
 * Wrong answers keep the learner on the same question. Only a correct answer
 * (or working through the reveal) advances the stream.
 */

export type Phase = "grinding" | "paused" | "revealed" | "summary";

/**
 * A correct answer advances the stream immediately — there is no confirmation
 * beat. The reward lands as a floating number over the transition instead of a
 * screen the learner has to dismiss, because "Enter to continue" turns a flow
 * state into a series of stops.
 */
export interface Award {
  xp: number;
  afterPause: boolean;
  /** Increments per award so the UI can replay the hit animation. */
  seq: number;
}

export interface SessionState {
  phase: Phase;
  selector: SelectorState;
  current: Question | null;
  /** Start of the current attempt, excluding pause time. */
  attemptStartedAt: number;
  pauseStartedAt: number | null;

  xp: number;
  streak: number;
  bestStreak: number;
  answered: number;
  correct: number;

  /** Wrong answers on the question currently in front of the learner. */
  wrongOnCurrent: number;
  consecutiveUnreadable: number;
  pauseOffered: boolean;
  usedPauseOnCurrent: boolean;
  /** 0 = pause not started; 1-3 = authored hint rungs. */
  hintRung: number;
  showNotationHelp: boolean;

  lastResult: CheckResult | null;
  /** Survives the question change so the hit can animate over the transition. */
  lastAward: Award | null;
  events: GameEvent[];
}

export const XP_PER_TIER = 10;
/** Getting unstuck is a win, so this reduces the award without punishing. */
export const POST_PAUSE_XP_FACTOR = 0.4;
export const MAX_HINT_RUNG = 3;
export const OFFER_PAUSE_AFTER_WRONG = 2;
export const NOTATION_HELP_AFTER_UNREADABLE = 2;

export function xpFor(tier: number, afterPause: boolean): number {
  const base = XP_PER_TIER * tier;
  return afterPause ? Math.max(1, Math.round(base * POST_PAUSE_XP_FACTOR)) : base;
}

function blank(now: number): SessionState {
  return {
    phase: "grinding",
    selector: initialSelector(),
    current: null,
    attemptStartedAt: now,
    pauseStartedAt: null,
    xp: 0,
    streak: 0,
    bestStreak: 0,
    answered: 0,
    correct: 0,
    wrongOnCurrent: 0,
    consecutiveUnreadable: 0,
    pauseOffered: false,
    usedPauseOnCurrent: false,
    hintRung: 0,
    showNotationHelp: false,
    lastResult: null,
    lastAward: null,
    events: [],
  };
}

/** Clear the per-question flags when a new question comes up. */
function freshQuestion(state: SessionState, q: Question, now: number): SessionState {
  return {
    ...state,
    phase: "grinding",
    selector: markServed(state.selector, q.id),
    current: q,
    attemptStartedAt: now,
    pauseStartedAt: null,
    wrongOnCurrent: 0,
    consecutiveUnreadable: 0,
    pauseOffered: false,
    usedPauseOnCurrent: false,
    hintRung: 0,
    showNotationHelp: false,
    lastResult: null,
    events: [
      ...state.events,
      { type: "question_served", ts: now, questionId: q.id, tier: q.tier },
    ],
  };
}

export function startSession(pool: Question[], now = Date.now()): SessionState {
  const base = blank(now);
  const withStart: SessionState = {
    ...base,
    events: [{ type: "session_start", ts: now }],
  };
  const first = selectQuestion(withStart.selector, pool);
  if (!first) return { ...withStart, phase: "summary" };
  return freshQuestion(withStart, first, now);
}

export function submitAnswer(
  state: SessionState,
  input: string,
  pool: Question[],
  now = Date.now(),
): SessionState {
  const q = state.current;
  if (!q || (state.phase !== "grinding" && state.phase !== "revealed")) return state;

  const result = checkAnswer(input, q);

  // Unreadable input is not an attempt. Nothing scores, nothing moves, and the
  // learner is offered help with notation rather than with calculus.
  if (result.verdict === "unreadable") {
    const consecutiveUnreadable = state.consecutiveUnreadable + 1;
    const showNotationHelp =
      consecutiveUnreadable >= NOTATION_HELP_AFTER_UNREADABLE;
    const events: GameEvent[] = [
      ...state.events,
      { type: "unreadable_input", ts: now, questionId: q.id },
    ];
    if (showNotationHelp && !state.showNotationHelp) {
      events.push({ type: "notation_help_shown", ts: now, questionId: q.id });
    }
    return {
      ...state,
      consecutiveUnreadable,
      showNotationHelp,
      lastResult: result,
      lastAward: null,
      events,
    };
  }

  const afterPause = state.usedPauseOnCurrent;
  const events: GameEvent[] = [
    ...state.events,
    {
      type: "answer_submitted",
      ts: now,
      questionId: q.id,
      tier: q.tier,
      verdict: result.verdict,
      misconceptionId: result.misconceptionId,
      latencyMs: Math.max(0, now - state.attemptStartedAt),
      afterPause,
    },
  ];

  const { state: selector, move } = applyVerdict(state.selector, result.verdict);
  if (move === "promoted" || move === "demoted") {
    events.push({
      type: "tier_move",
      ts: now,
      from: state.selector.tier,
      to: selector.tier,
      move,
    });
  }

  if (result.verdict === "correct") {
    const streak = state.streak + 1;
    const correct = state.correct + 1;
    const scored: SessionState = {
      ...state,
      selector,
      xp: state.xp + xpFor(q.tier, afterPause),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      answered: state.answered + 1,
      correct,
      consecutiveUnreadable: 0,
      lastResult: result,
      lastAward: { xp: xpFor(q.tier, afterPause), afterPause, seq: correct },
      events,
    };

    // Straight into the next question. No confirmation step.
    const next = selectQuestion(scored.selector, pool);
    if (!next) return endSession(scored, now);
    return freshQuestion(scored, next, now);
  }

  const wrongOnCurrent = state.wrongOnCurrent + 1;
  return {
    ...state,
    phase: "grinding",
    selector,
    streak: 0,
    answered: state.answered + 1,
    wrongOnCurrent,
    consecutiveUnreadable: 0,
    // Offer, never force. The learner still chooses to enter the pause.
    pauseOffered:
      state.pauseOffered || wrongOnCurrent >= OFFER_PAUSE_AFTER_WRONG,
    attemptStartedAt: now,
    lastResult: result,
    // Clear any stale reward so a wrong answer never sits next to a +XP.
    lastAward: null,
    events,
  };
}

export function invokePause(
  state: SessionState,
  trigger: "manual" | "offered",
  now = Date.now(),
): SessionState {
  if (!state.current || state.phase === "paused" || state.phase === "summary") {
    return state;
  }
  return {
    ...state,
    phase: "paused",
    pauseStartedAt: now,
    usedPauseOnCurrent: true,
    hintRung: 1,
    lastResult: null,
    events: [
      ...state.events,
      { type: "pause_invoked", ts: now, questionId: state.current.id, trigger },
      { type: "hint_rung", ts: now, questionId: state.current.id, rung: 1 },
    ],
  };
}

/**
 * Advance one rung. There is no infinite chat: after rung 3 the tutor stops
 * asking and the worked solution is revealed step by step.
 */
export function advanceHint(state: SessionState, now = Date.now()): SessionState {
  if (state.phase !== "paused" || !state.current) return state;

  if (state.hintRung >= MAX_HINT_RUNG) {
    return {
      ...state,
      phase: "revealed",
      events: [
        ...state.events,
        { type: "solution_revealed", ts: now, questionId: state.current.id },
      ],
    };
  }

  const rung = state.hintRung + 1;
  return {
    ...state,
    hintRung: rung,
    events: [
      ...state.events,
      { type: "hint_rung", ts: now, questionId: state.current.id, rung },
    ],
  };
}

/**
 * Append an event that the loop itself did not cause.
 *
 * The tutor lives outside this state machine — it is a network call the UI
 * makes during a pause, and whether it replied or fell back has no bearing on
 * phase, XP or tier. But it does belong in the same ordered log, because
 * "did the pause unstick people" (design doc #7) is answered by reading a
 * tutor outcome and the next `answer_submitted` in sequence.
 */
export function recordEvent(state: SessionState, event: GameEvent): SessionState {
  return { ...state, events: [...state.events, event] };
}

/** Leave the pause with the question intact and re-presented fresh. */
export function resumeFromPause(
  state: SessionState,
  now = Date.now(),
): SessionState {
  if (!state.current) return state;
  if (state.phase !== "paused" && state.phase !== "revealed") return state;

  return {
    ...state,
    phase: "grinding",
    // Latency for the next attempt starts now, so pause time never lands in
    // per-question latency.
    attemptStartedAt: now,
    pauseStartedAt: null,
    wrongOnCurrent: 0,
    pauseOffered: false,
    lastResult: null,
    events: [
      ...state.events,
      {
        type: "pause_ended",
        ts: now,
        questionId: state.current.id,
        durationMs: state.pauseStartedAt ? Math.max(0, now - state.pauseStartedAt) : 0,
        reachedRung: state.hintRung,
      },
    ],
  };
}

export function nextQuestion(
  state: SessionState,
  pool: Question[],
  now = Date.now(),
): SessionState {
  const next = selectQuestion(state.selector, pool);
  if (!next) return endSession(state, now);
  return freshQuestion(state, next, now);
}

export function dismissNotationHelp(state: SessionState): SessionState {
  return { ...state, showNotationHelp: false, consecutiveUnreadable: 0 };
}

export function endSession(state: SessionState, now = Date.now()): SessionState {
  return {
    ...state,
    phase: "summary",
    events: [
      ...state.events,
      {
        type: "session_end",
        ts: now,
        answered: state.answered,
        correct: state.correct,
        xp: state.xp,
      },
    ],
  };
}
