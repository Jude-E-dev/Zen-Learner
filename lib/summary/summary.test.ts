import { describe, expect, it } from "vitest";
import { initialSelector } from "../game/selector";
import type { SessionState } from "../game/session";
import type { GameEvent } from "../game/events";
import { defaultAvatar } from "../game/avatar";
import { summaryFromSession } from "./summary";

/**
 * `summaryFromSession`'s timed computation, isolated from a real session run.
 *
 * The permalink round-trip (permalink.test.ts) only ever carries a
 * `SummaryBlob` that already has `times` baked in — it never exercises the
 * arithmetic that produces `median`/`fastest` from the raw event stream, which
 * is what this file is for.
 */

function answered(
  questionId: string,
  verdict: "correct" | "incorrect",
  latencyMs: number,
): GameEvent {
  return {
    type: "answer_submitted",
    ts: latencyMs,
    questionId,
    tier: 1,
    verdict,
    latencyMs,
    afterPause: false,
  };
}

function fakeState(events: GameEvent[], overrides: Partial<SessionState> = {}): SessionState {
  return {
    phase: "grinding",
    selector: initialSelector(),
    current: null,
    attemptStartedAt: 0,
    pauseStartedAt: null,
    xp: 0,
    streak: 0,
    bestStreak: 0,
    answered: events.filter((e) => e.type === "answer_submitted").length,
    correct: events.filter((e) => e.type === "answer_submitted" && e.verdict === "correct")
      .length,
    wrongOnCurrent: 0,
    consecutiveUnreadable: 0,
    pauseOffered: false,
    usedPauseOnCurrent: false,
    hintRung: 0,
    showNotationHelp: false,
    lastResult: null,
    lastAward: null,
    events,
    ...overrides,
  };
}

describe("summaryFromSession — timed median and fastest", () => {
  it("computes the median and fastest from correct-only latencies", () => {
    const state = fakeState([
      answered("q1", "correct", 9000),
      answered("q2", "correct", 1000),
      answered("q3", "correct", 5000),
      answered("q4", "correct", 3000),
    ]);
    const summary = summaryFromSession(state, "ronin", 1, defaultAvatar(), "mental-math", true);
    // Sorted: 1000, 3000, 5000, 9000 — even count, so the median is the
    // average of the two middle values.
    expect(summary.times).toEqual({ median: 4000, fastest: 1000 });
  });

  it("excludes wrong answers from both the median and the fastest time", () => {
    const state = fakeState([
      // A near-instant wrong guess must not win "fastest".
      answered("q1", "incorrect", 50),
      answered("q2", "correct", 2000),
      answered("q3", "correct", 4000),
      answered("q4", "correct", 6000),
    ]);
    const summary = summaryFromSession(state, "ronin", 1, defaultAvatar(), "mental-math", true);
    expect(summary.times).toEqual({ median: 4000, fastest: 2000 });
  });

  it("returns null times when the drill was not timed, even with correct answers", () => {
    const state = fakeState([answered("q1", "correct", 1000), answered("q2", "correct", 2000)]);
    const summary = summaryFromSession(state, "ronin", 1, defaultAvatar(), "calculus", false);
    expect(summary.times).toBeNull();
  });

  it("returns null times for a timed drill with no correct answers to time", () => {
    const state = fakeState([answered("q1", "incorrect", 1000)]);
    const summary = summaryFromSession(state, "ronin", 1, defaultAvatar(), "mental-math", true);
    expect(summary.times).toBeNull();
  });

  it("takes the single value as both median and fastest with one correct answer", () => {
    const state = fakeState([answered("q1", "correct", 4200)]);
    const summary = summaryFromSession(state, "ronin", 1, defaultAvatar(), "mental-math", true);
    expect(summary.times).toEqual({ median: 4200, fastest: 4200 });
  });
});
