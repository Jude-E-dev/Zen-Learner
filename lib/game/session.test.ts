import { describe, expect, it } from "vitest";
import { loadAll } from "../content/load";
import { generateMentalMath } from "../content/mental";
import type { Question } from "../content/schema";
import { normalize } from "../equivalence/normalize";
import {
  applyVerdict,
  initialSelector,
  markServed,
  selectQuestion,
} from "./selector";
import {
  advanceHint,
  dismissNotationHelp,
  invokePause,
  nextQuestion,
  resumeFromPause,
  startSession,
  submitAnswer,
  xpFor,
  type SessionState,
} from "./session";

const pool: Question[] = loadAll().flatMap((f) => f.questions);
const byId = new Map(pool.map((q) => [q.id, q]));

function question(id: string): Question {
  const q = byId.get(id);
  if (!q) throw new Error(`missing fixture question ${id}`);
  return q;
}

/** Drive the session to a specific question so tests can control the answer. */
function sessionOn(id: string): SessionState {
  const q = question(id);
  const state = startSession(pool, 1_000);
  return { ...state, current: q, selector: markServed(state.selector, q.id) };
}

describe("selector — tier movement", () => {
  it("promotes after three correct in a row", () => {
    let s = initialSelector(2);
    for (let i = 0; i < 2; i++) s = applyVerdict(s, "correct").state;
    expect(s.tier).toBe(2);

    const third = applyVerdict(s, "correct");
    expect(third.move).toBe("promoted");
    expect(third.state.tier).toBe(3);
    expect(third.state.correctStreak).toBe(0);
  });

  it("demotes after two wrong", () => {
    let s = initialSelector(3);
    s = applyVerdict(s, "incorrect").state;
    expect(s.tier).toBe(3);

    const second = applyVerdict(s, "incorrect");
    expect(second.move).toBe("demoted");
    expect(second.state.tier).toBe(2);
  });

  it("breaks a correct streak on a wrong answer", () => {
    let s = initialSelector(2);
    s = applyVerdict(s, "correct").state;
    s = applyVerdict(s, "correct").state;
    s = applyVerdict(s, "incorrect").state;
    expect(s.correctStreak).toBe(0);
    expect(applyVerdict(s, "correct").state.tier).toBe(2);
  });

  it("clamps promotion at tier 5 and marks the learner at cap", () => {
    let s = initialSelector(5);
    s = applyVerdict(s, "correct").state;
    s = applyVerdict(s, "correct").state;
    const capped = applyVerdict(s, "correct");
    expect(capped.move).toBe("at-cap");
    expect(capped.state.tier).toBe(5);
    expect(capped.state.atCap).toBe(true);
  });

  it("clamps demotion at tier 1", () => {
    let s = initialSelector(1);
    s = applyVerdict(s, "incorrect").state;
    const floored = applyVerdict(s, "incorrect");
    expect(floored.move).toBe("at-floor");
    expect(floored.state.tier).toBe(1);
  });

  it("moves nothing at all on unreadable input", () => {
    const s = initialSelector(3);
    const after = applyVerdict(s, "unreadable");
    expect(after.move).toBe("held");
    expect(after.state).toEqual(s);
  });

  it("never demotes from an accumulation of typos", () => {
    let s = initialSelector(3);
    for (let i = 0; i < 20; i++) s = applyVerdict(s, "unreadable").state;
    expect(s.tier).toBe(3);
    expect(s.wrongStreak).toBe(0);
  });
});

describe("selector — question choice", () => {
  it("serves a question at the current tier when one is unseen", () => {
    const s = initialSelector(2);
    const picked = selectQuestion(s, pool);
    expect(picked?.tier).toBe(2);
  });

  it("widens to a neighbouring tier when the current tier is exhausted", () => {
    let s = initialSelector(4);
    // Tier 4 has exactly one question in the current bank.
    for (const q of pool.filter((p) => p.tier === 4)) s = markServed(s, q.id);
    const picked = selectQuestion(s, pool);
    expect(picked).not.toBeNull();
    expect(picked!.tier).not.toBe(4);
    expect(Math.abs(picked!.tier - 4)).toBeLessThanOrEqual(2);
  });

  it("falls back to repeats only once everything has been seen", () => {
    let s = initialSelector(3);
    for (const q of pool) s = markServed(s, q.id);
    const picked = selectQuestion(s, pool);
    expect(picked).not.toBeNull();
    // Prefers something at or near the current tier even when repeating.
    expect(Math.abs(picked!.tier - 3)).toBeLessThanOrEqual(1);
  });

  it("returns null for an empty bank rather than throwing", () => {
    expect(selectQuestion(initialSelector(1), [])).toBeNull();
  });
});

describe("session — the grind", () => {
  it("starts on a question and logs the session opening", () => {
    const s = startSession(pool, 1_000);
    expect(s.current).not.toBeNull();
    expect(s.phase).toBe("grinding");
    expect(s.events[0].type).toBe("session_start");
    expect(s.events.some((e) => e.type === "question_served")).toBe(true);
  });

  it("awards XP scaled by tier on a correct answer", () => {
    const s = sessionOn("chain-rule-power"); // tier 1
    const after = submitAnswer(s, "15(3x+1)^4", pool, 2_000);
    expect(after.xp).toBe(xpFor(1, false));
    expect(after.correct).toBe(1);
    expect(after.streak).toBe(1);
  });

  it("advances to the next question immediately, with no confirmation step", () => {
    const s = sessionOn("chain-rule-power");
    const after = submitAnswer(s, "15(3x+1)^4", pool, 2_000);
    expect(after.phase).toBe("grinding");
    expect(after.current?.id).not.toBe("chain-rule-power");
    // The reward survives the transition so it can animate over it.
    expect(after.lastAward).toMatchObject({ xp: xpFor(1, false), afterPause: false });
  });

  it("clears a stale reward when the next answer is wrong", () => {
    const scored = submitAnswer(sessionOn("chain-rule-power"), "15(3x+1)^4", pool, 2_000);
    expect(scored.lastAward).not.toBeNull();

    // Put a known question back in front so the wrong answer is unambiguous.
    const s = { ...scored, current: question("chain-rule-power") };
    expect(submitAnswer(s, "5(3x+1)^4", pool, 3_000).lastAward).toBeNull();
  });

  it("clears a stale reward when the next input is unreadable", () => {
    const scored = submitAnswer(sessionOn("chain-rule-power"), "15(3x+1)^4", pool, 2_000);
    expect(submitAnswer(scored, "((", pool, 3_000).lastAward).toBeNull();
  });

  it("keeps the learner on the same question after a wrong answer", () => {
    const s = sessionOn("chain-rule-power");
    const after = submitAnswer(s, "5(3x+1)^4", pool, 2_000);
    expect(after.phase).toBe("grinding");
    expect(after.current?.id).toBe("chain-rule-power");
    expect(after.wrongOnCurrent).toBe(1);
    expect(after.streak).toBe(0);
  });

  it("offers the pause after two wrong attempts, without forcing it", () => {
    let s = sessionOn("chain-rule-power");
    s = submitAnswer(s, "5(3x+1)^4", pool, 2_000);
    expect(s.pauseOffered).toBe(false);
    s = submitAnswer(s, "15(3x+1)^5", pool, 3_000);
    expect(s.pauseOffered).toBe(true);
    expect(s.phase).toBe("grinding"); // offered, not entered
  });

  it("records the misconception behind a wrong answer", () => {
    const s = sessionOn("chain-rule-power");
    const after = submitAnswer(s, "5(3x+1)^4", pool, 2_000);
    const event = after.events.find((e) => e.type === "answer_submitted");
    expect(event).toMatchObject({
      verdict: "incorrect",
      misconceptionId: "forgot-inner-derivative",
    });
  });
});

describe("session — unreadable input", () => {
  it("does not count as an attempt", () => {
    const s = sessionOn("chain-rule-power");
    const after = submitAnswer(s, "((", pool, 2_000);
    expect(after.answered).toBe(0);
    expect(after.wrongOnCurrent).toBe(0);
    expect(after.selector.wrongStreak).toBe(0);
  });

  it("does not break a correct streak", () => {
    let s = sessionOn("chain-rule-power");
    s = submitAnswer(s, "15(3x+1)^4", pool, 2_000);
    const streakBefore = s.streak;
    const after = submitAnswer(s, "!!!", pool, 3_000);
    expect(after.streak).toBe(streakBefore);
  });

  it("never triggers the tutor pause", () => {
    let s = sessionOn("chain-rule-power");
    s = submitAnswer(s, "((", pool, 2_000);
    s = submitAnswer(s, "))", pool, 3_000);
    expect(s.pauseOffered).toBe(false);
    expect(s.usedPauseOnCurrent).toBe(false);
  });

  it("offers notation help after two consecutive unreadable submissions", () => {
    let s = sessionOn("chain-rule-power");
    s = submitAnswer(s, "((", pool, 2_000);
    expect(s.showNotationHelp).toBe(false);
    s = submitAnswer(s, "x +", pool, 3_000);
    expect(s.showNotationHelp).toBe(true);
    expect(s.events.some((e) => e.type === "notation_help_shown")).toBe(true);
  });

  it("resets the unreadable run once a real answer lands", () => {
    let s = sessionOn("chain-rule-power");
    s = submitAnswer(s, "((", pool, 2_000);
    s = submitAnswer(s, "5(3x+1)^4", pool, 3_000);
    expect(s.consecutiveUnreadable).toBe(0);
  });

  /*
   * The mental-math fix: a submission that parses fine but restates the sum
   * (`needsEvaluation: true`) is not a notation problem, so it must not count
   * toward the notation-help trigger the way genuinely unreadable input does.
   */
  it("does not count a submission that needs evaluation toward consecutiveUnreadable", () => {
    const mm = generateMentalMath(99, 3).find((mq) => mq.subtopic === "addition")!;
    let s: SessionState = { ...startSession(pool, 1_000), current: mm };
    s = { ...s, selector: markServed(s.selector, mm.id) };

    // The unevaluated sum itself: parses, needs evaluation, must not count.
    s = submitAnswer(s, normalize(mm.prompt), pool, 2_000);
    expect(s.lastResult?.needsEvaluation).toBe(true);
    expect(s.consecutiveUnreadable).toBe(0);
    expect(s.showNotationHelp).toBe(false);

    // A second one, for good measure — still zero.
    s = submitAnswer(s, normalize(mm.prompt), pool, 3_000);
    expect(s.consecutiveUnreadable).toBe(0);
    expect(s.showNotationHelp).toBe(false);

    // Contrast: genuinely unreadable input on the same question does count,
    // and after two of them notation help kicks in as usual.
    s = submitAnswer(s, "((", pool, 4_000);
    s = submitAnswer(s, "x +", pool, 5_000);
    expect(s.consecutiveUnreadable).toBe(2);
    expect(s.showNotationHelp).toBe(true);
  });

  it("clears notation help when dismissed", () => {
    let s = sessionOn("chain-rule-power");
    s = submitAnswer(s, "((", pool, 2_000);
    s = submitAnswer(s, "((", pool, 3_000);
    s = dismissNotationHelp(s);
    expect(s.showNotationHelp).toBe(false);
  });
});

describe("session — the pause", () => {
  it("walks exactly three rungs, then reveals the solution", () => {
    let s = invokePause(sessionOn("chain-rule-power"), "manual", 2_000);
    expect(s.phase).toBe("paused");
    expect(s.hintRung).toBe(1);

    s = advanceHint(s, 3_000);
    expect(s.hintRung).toBe(2);
    s = advanceHint(s, 4_000);
    expect(s.hintRung).toBe(3);

    s = advanceHint(s, 5_000);
    expect(s.phase).toBe("revealed");
    expect(s.events.some((e) => e.type === "solution_revealed")).toBe(true);
  });

  it("returns to the same question intact on resume", () => {
    let s = invokePause(sessionOn("chain-rule-power"), "manual", 2_000);
    s = resumeFromPause(s, 6_000);
    expect(s.phase).toBe("grinding");
    expect(s.current?.id).toBe("chain-rule-power");
    expect(s.wrongOnCurrent).toBe(0);
  });

  it("awards reduced but non-zero XP for getting unstuck", () => {
    let s = invokePause(sessionOn("chain-rule-power"), "manual", 2_000);
    s = resumeFromPause(s, 6_000);
    s = submitAnswer(s, "15(3x+1)^4", pool, 7_000);
    expect(s.xp).toBe(xpFor(1, true));
    expect(s.xp).toBeGreaterThan(0);
    expect(s.xp).toBeLessThan(xpFor(1, false));
  });

  it("keeps pause time out of per-question latency", () => {
    let s = sessionOn("chain-rule-power");
    s = invokePause(s, "manual", 2_000);
    // A long think inside the pause.
    s = resumeFromPause(s, 120_000);
    s = submitAnswer(s, "15(3x+1)^4", pool, 123_000);
    const event = s.events.find(
      (e) => e.type === "answer_submitted",
    ) as Extract<typeof s.events[number], { type: "answer_submitted" }>;
    expect(event.latencyMs).toBe(3_000);
    expect(event.afterPause).toBe(true);
  });

  it("logs pause duration and the rung reached", () => {
    let s = invokePause(sessionOn("chain-rule-power"), "offered", 2_000);
    s = advanceHint(s, 3_000);
    s = resumeFromPause(s, 10_000);
    const ended = s.events.find((e) => e.type === "pause_ended");
    expect(ended).toMatchObject({ durationMs: 8_000, reachedRung: 2 });
  });
});

describe("content bank — sized for a real session", () => {
  it("has enough questions to run a full session without repeating", () => {
    let s = startSession(pool, 0);
    const served: string[] = [];

    for (let i = 0; i < pool.length; i++) {
      served.push(s.current!.id);
      s = submitAnswer(s, s.current!.canonicalAnswer, pool, i * 1000);
    }

    // A 20-30 question session is the stated target, and recycling questions
    // inside one would turn the mastery gate into a memory test.
    expect(new Set(served).size).toBe(pool.length);
    expect(pool.length).toBeGreaterThanOrEqual(30);
  });

  it("carries enough depth at every tier for the selector to work", () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const atTier = pool.filter((q) => q.tier === tier);
      expect(atTier.length, `tier ${tier} has no questions`).toBeGreaterThan(0);
    }
    // Difficulty should bunch in the middle, not sit flat.
    const mid = pool.filter((q) => q.tier === 2 || q.tier === 3).length;
    expect(mid).toBeGreaterThan(pool.length / 2);
  });
});

describe("session — end to end", () => {
  it("runs a full grind without ever dead-ending", () => {
    let s = startSession(pool, 0);
    for (let i = 0; i < 40 && s.phase !== "summary"; i++) {
      const q = s.current!;
      s = submitAnswer(s, q.canonicalAnswer, pool, i * 1_000 + 500);
      expect(s.phase).toBe("grinding");
    }
    expect(s.answered).toBe(40);
    expect(s.correct).toBe(40);
    // 40 correct answers from tier 1 must reach the cap.
    expect(s.selector.tier).toBe(5);
    expect(s.selector.atCap).toBe(true);
  });
});
