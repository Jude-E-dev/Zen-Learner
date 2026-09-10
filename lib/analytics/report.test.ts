import { describe, expect, it } from "vitest";
import { buildReport, parseJsonl, parseRow, rate, type Row } from "./report";
import type { GameEvent } from "../game/events";

let clock = 0;
const at = (ms?: number) => (ms === undefined ? (clock += 1000) : (clock = ms));

function rows(session: number, events: GameEvent[]): Row[] {
  return events.map((event) => ({ session, event }));
}

const answer = (
  questionId: string,
  verdict: "correct" | "incorrect",
  afterPause = false,
  latencyMs = 5000,
): GameEvent => ({
  type: "answer_submitted",
  ts: at(),
  questionId,
  tier: 1,
  verdict,
  latencyMs,
  afterPause,
});

const served = (questionId: string): GameEvent => ({
  type: "question_served",
  ts: at(),
  questionId,
  tier: 1,
});

const pause = (questionId: string): GameEvent => ({
  type: "pause_invoked",
  ts: at(),
  questionId,
  trigger: "manual",
});

const tutorReplied = (questionId: string, rung: number, retried = false): GameEvent => ({
  type: "tutor_replied",
  ts: at(),
  questionId,
  rung,
  retried,
});

const tutorFallback = (
  questionId: string,
  rung: number,
  reason: "leak" | "timeout" | "provider-error" | "not-configured" | "quota",
): GameEvent => ({
  type: "tutor_fallback",
  ts: at(),
  questionId,
  rung,
  reason,
});

const pauseEnd = (questionId: string, durationMs: number, reachedRung: number): GameEvent => ({
  type: "pause_ended",
  ts: at(),
  questionId,
  durationMs,
  reachedRung,
});

describe("parsing the exported JSONL", () => {
  it("reads well-formed rows", () => {
    const text = [
      JSON.stringify({ session: 1, type: "session_start", ts: 10 }),
      JSON.stringify({ session: 1, type: "unreadable_input", ts: 20, questionId: "q1" }),
    ].join("\n");

    const { rows: parsed, skipped } = parseJsonl(text);
    expect(parsed).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(parsed[0].session).toBe(1);
    expect(parsed[0].event.type).toBe("session_start");
  });

  it("ignores blank lines without counting them as damage", () => {
    const text = `\n${JSON.stringify({ session: 1, type: "session_start", ts: 1 })}\n\n`;
    const { rows: parsed, skipped } = parseJsonl(text);
    expect(parsed).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("skips and counts bad lines rather than aborting the whole report", () => {
    const text = [
      JSON.stringify({ session: 1, type: "session_start", ts: 1 }),
      "{ not json",
      JSON.stringify({ session: "one", type: "session_start", ts: 1 }),
      JSON.stringify({ type: "session_start", ts: 1 }),
      JSON.stringify({ session: 1, type: "session_end", ts: 2, answered: 0, correct: 0, xp: 0 }),
    ].join("\n");

    const { rows: parsed, skipped } = parseJsonl(text);
    expect(parsed).toHaveLength(2);
    expect(skipped).toBe(3);
  });

  it.each(["", "   ", "null", "42", '"a string"', "[1,2,3]"])(
    "returns null for %s",
    (line) => {
      expect(parseRow(line)).toBeNull();
    },
  );
});

describe("hypothesis 1 — does the pause unstick people", () => {
  it("counts a post-pause retry separately from an unaided one", () => {
    clock = 0;
    const report = buildReport([
      ...rows(1, [
        // Wrong, paused, then right: the aided arm.
        served("q1"),
        answer("q1", "incorrect"),
        pause("q1"),
        pauseEnd("q1", 30_000, 2),
        answer("q1", "correct", true),
        // Wrong, no pause, then right: the unaided arm.
        served("q2"),
        answer("q2", "incorrect"),
        answer("q2", "correct"),
      ]),
    ]);

    expect(report.pause.retries.afterPause).toEqual({ attempts: 1, correct: 1 });
    expect(report.pause.retries.unaided).toEqual({ attempts: 1, correct: 1 });
    expect(report.pause.flagMismatches).toBe(0);
  });

  it("does not count a first attempt as a retry in either arm", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [served("q1"), answer("q1", "correct"), served("q2"), answer("q2", "incorrect")]),
    );
    expect(report.pause.retries.afterPause.attempts).toBe(0);
    expect(report.pause.retries.unaided.attempts).toBe(0);
  });

  it("treats a pause with no following attempt as abandoned", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [served("q1"), answer("q1", "incorrect"), pause("q1"), pauseEnd("q1", 12_000, 1)]),
    );
    expect(report.pause.invoked).toBe(1);
    expect(report.pause.resolved).toBe(0);
    expect(report.pause.abandoned).toBe(1);
  });

  it("counts every retry within one paused serving as aided", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [
        served("q1"),
        answer("q1", "incorrect"),
        pause("q1"),
        answer("q1", "incorrect", true),
        answer("q1", "correct", true),
      ]),
    );
    // Both retries happened inside the paused serving; one of them was wrong.
    expect(report.pause.retries.afterPause).toEqual({ attempts: 2, correct: 1 });
    expect(report.pause.retries.unaided.attempts).toBe(0);
  });

  /*
   * The bug this replaced: an abandoned pause left the question marked "aided"
   * for the rest of the session, so when it came round again much later its
   * retry was credited to the ladder. Servings, not questions.
   */
  it("does not credit a later serving of the same question to an earlier pause", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [
        served("q1"),
        answer("q1", "incorrect"),
        pause("q1"),
        pauseEnd("q1", 20_000, 2),
        // Walked away without retrying — the pause is abandoned.
        served("q2"),
        answer("q2", "correct"),
        // q1 comes round again. This retry had no help.
        served("q1"),
        answer("q1", "incorrect"),
        answer("q1", "correct"),
      ]),
    );
    expect(report.pause.retries.afterPause.attempts).toBe(0);
    expect(report.pause.retries.unaided).toEqual({ attempts: 1, correct: 1 });
    expect(report.pause.abandoned).toBe(1);
  });

  it("tallies how deep the ladder was walked", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [pauseEnd("q1", 10_000, 1), pauseEnd("q2", 20_000, 3), pauseEnd("q3", 30_000, 3)]),
    );
    expect(report.pause.rungsReached).toEqual({ 1: 1, 3: 2 });
    expect(report.pause.medianPauseMs).toBe(20_000);
  });

  it("does not let one session's pause leak into another", () => {
    clock = 0;
    const report = buildReport([
      ...rows(1, [served("q1"), answer("q1", "incorrect"), pause("q1")]),
      ...rows(2, [served("q1"), answer("q1", "incorrect"), answer("q1", "correct")]),
    ]);
    // Session 2's retry is unaided; session 1's pause never got its retry.
    expect(report.pause.retries.unaided).toEqual({ attempts: 1, correct: 1 });
    expect(report.pause.retries.afterPause.attempts).toBe(0);
  });

  it("ignores attempts that arrive with no question served", () => {
    clock = 0;
    const report = buildReport(rows(1, [answer("q1", "incorrect"), answer("q1", "correct")]));
    expect(report.pause.retries.afterPause.attempts).toBe(0);
    expect(report.pause.retries.unaided.attempts).toBe(0);
    // The session summary still counts them; only the arms are serving-scoped.
    expect(report.sessions[0].answered).toBe(2);
  });
});

describe("hypothesis 2 — does the loop survive its own novelty", () => {
  const played = (session: number, count: number, startTs: number, endTs: number): Row[] => {
    clock = startTs;
    const events: GameEvent[] = [{ type: "session_start", ts: startTs }];
    for (let i = 0; i < count; i++) {
      events.push(served(`q${i}`));
      events.push(answer(`q${i}`, "correct"));
    }
    events.push({
      type: "session_end",
      ts: endTs,
      answered: count,
      correct: count,
      xp: count * 10,
    });
    return rows(session, events);
  };

  it("reports session lengths in order", () => {
    const report = buildReport([
      ...played(1, 12, 0, 600_000),
      ...played(2, 8, 0, 400_000),
      ...played(5, 15, 0, 900_000),
    ]);
    expect(report.retention.lengths).toEqual([12, 8, 15]);
    expect(report.retention.sessions).toBe(3);
  });

  it("picks out session 1 and session 5 for the comparison as posed", () => {
    const report = buildReport([...played(1, 12, 0, 600_000), ...played(5, 15, 0, 900_000)]);
    expect(report.retention.first?.answered).toBe(12);
    expect(report.retention.fifth?.answered).toBe(15);
    expect(report.retention.first?.durationMs).toBe(600_000);
  });

  it("leaves session 5 null when it has not happened yet", () => {
    const report = buildReport(played(1, 3, 0, 60_000));
    expect(report.retention.fifth).toBeNull();
    expect(report.notes.join(" ")).toMatch(/needs 5/);
  });

  it("reports a null duration when a session never ended", () => {
    clock = 0;
    const report = buildReport(
      rows(3, [{ type: "session_start", ts: 100 }, served("q1"), answer("q1", "correct")]),
    );
    expect(report.sessions[0].durationMs).toBeNull();
  });

  it("reports the median attempt latency, pause time excluded", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [
        served("q1"), answer("q1", "correct", false, 1000),
        served("q2"), answer("q2", "correct", false, 3000),
        served("q3"), answer("q3", "correct", false, 9000),
      ]),
    );
    expect(report.sessions[0].medianLatencyMs).toBe(3000);
  });
});

describe("the report's own honesty", () => {
  it("says so when there is nothing to report", () => {
    const report = buildReport([]);
    expect(report.sessions).toHaveLength(0);
    expect(report.notes.join(" ")).toMatch(/No sessions/);
  });

  it("warns that a handful of retries is not a rate", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [served("q1"), answer("q1", "incorrect"), pause("q1"), answer("q1", "correct", true)]),
    );
    expect(report.notes.join(" ")).toMatch(/too few/);
  });

  it("warns when the aided arm has no baseline to be compared against", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [served("q1"), answer("q1", "incorrect"), pause("q1"), answer("q1", "correct", true)]),
    );
    expect(report.notes.join(" ")).toMatch(/no baseline/);
  });

  it("surfaces skipped lines in the notes", () => {
    expect(buildReport([], 4).notes.join(" ")).toMatch(/4 unparseable/);
  });

  it("returns null rather than NaN for a rate with no attempts", () => {
    expect(rate({ attempts: 0, correct: 0 })).toBeNull();
    expect(rate({ attempts: 4, correct: 3 })).toBe(0.75);
  });
});

describe("analyseTutor — how the tutor layer actually behaved", () => {
  it("tallies replies, retries and fallbacks by reason across sessions", () => {
    clock = 0;
    const report = buildReport([
      ...rows(1, [
        tutorReplied("q1", 1, false),
        tutorReplied("q2", 1, true),
        tutorFallback("q3", 2, "leak"),
      ]),
      ...rows(2, [tutorFallback("q4", 1, "timeout"), tutorFallback("q5", 1, "leak")]),
    ]);

    expect(report.tutor).toEqual({
      attempted: 5,
      replied: 2,
      retried: 1,
      fellBack: 3,
      byReason: { leak: 2, timeout: 1 },
    });
  });

  it("reports zeroes rather than throwing when the tutor was never invoked", () => {
    const report = buildReport(rows(1, [{ type: "session_start", ts: 0 }]));
    expect(report.tutor).toEqual({
      attempted: 0,
      replied: 0,
      retried: 0,
      fellBack: 0,
      byReason: {},
    });
  });

  it("notes a high fallback rate once there are enough tutored turns to call it a rate", () => {
    clock = 0;
    // 10 attempted, 3 fell back — 30%, above the 20% threshold, and the
    // attempted count clears the >= 10 floor the note requires.
    const events: GameEvent[] = [
      ...Array.from({ length: 7 }, (_, i) => tutorReplied(`q${i}`, 1)),
      tutorFallback("qa", 1, "leak"),
      tutorFallback("qb", 1, "leak"),
      tutorFallback("qc", 1, "timeout"),
    ];
    const report = buildReport(rows(1, events));
    expect(report.notes.join(" ")).toMatch(/30% of tutored turns fell back/);
    expect(report.notes.join(" ")).toMatch(/leak 2/);
    expect(report.notes.join(" ")).toMatch(/timeout 1/);
  });

  it("does not raise the fallback-rate note under ten attempts, even at 100%", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [tutorFallback("q1", 1, "leak"), tutorFallback("q2", 1, "leak")]),
    );
    expect(report.notes.join(" ")).not.toMatch(/fell back to the authored ladder/);
  });

  it("notes when pauses were invoked but the tutor was never asked", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [served("q1"), answer("q1", "incorrect"), pause("q1"), pauseEnd("q1", 10_000, 1)]),
    );
    expect(report.tutor.attempted).toBe(0);
    expect(report.pause.invoked).toBe(1);
    expect(report.notes.join(" ")).toMatch(/running without a key/);
  });

  it("does not raise the no-key note when the tutor was in fact asked", () => {
    clock = 0;
    const report = buildReport(
      rows(1, [
        served("q1"),
        answer("q1", "incorrect"),
        pause("q1"),
        tutorReplied("q1", 1),
        pauseEnd("q1", 10_000, 1),
      ]),
    );
    expect(report.notes.join(" ")).not.toMatch(/running without a key/);
  });
});
