import { describe, expect, it } from "vitest";
import { loadAll } from "../content/load";
import { startSession, submitAnswer } from "../game/session";
import { rankFor, statsAtOrAbove } from "../game/ranks";
import { emptyProfile, memoryStore } from "./store";
import { mergeSession, toJsonl } from "./profile";

const pool = loadAll().flatMap((f) => f.questions);

function playedSession(correctAnswers: number) {
  let s = startSession(pool, 0);
  for (let i = 0; i < correctAnswers; i++) {
    s = submitAnswer(s, s.current!.canonicalAnswer, pool, i * 1000);
  }
  return s;
}

describe("store — the memory fallback", () => {
  it("declares itself non-durable rather than pretending", () => {
    expect(memoryStore().durable).toBe(false);
  });

  it("round-trips a profile within the session", async () => {
    const store = memoryStore();
    const profile = { ...emptyProfile(), totalXp: 120, sessions: 3 };
    await store.saveProfile(profile);
    expect(await store.loadProfile()).toEqual(profile);
  });

  it("accumulates events across batches with their session number", async () => {
    const store = memoryStore();
    await store.appendEvents(1, [{ type: "session_start", ts: 1 }]);
    await store.appendEvents(2, [{ type: "session_start", ts: 2 }]);
    const rows = await store.readEvents();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.session)).toEqual([1, 2]);
  });

  it("clears everything", async () => {
    const store = memoryStore();
    await store.saveProfile({ ...emptyProfile(), totalXp: 99 });
    await store.appendEvents(1, [{ type: "session_start", ts: 1 }]);
    await store.clear();
    expect((await store.loadProfile()).totalXp).toBe(0);
    expect(await store.readEvents()).toHaveLength(0);
  });
});

describe("profile — merging a session", () => {
  it("accumulates XP and session count across sessions", () => {
    const first = mergeSession(emptyProfile(), playedSession(3), 5_000);
    const second = mergeSession(first, playedSession(2), 9_000);

    expect(second.sessions).toBe(2);
    expect(second.totalXp).toBe(first.totalXp + playedSession(2).xp);
    expect(second.lastSessionAt).toBe(9_000);
  });

  it("carries mastery forward so ranks survive a reload", () => {
    let profile = emptyProfile();
    for (let i = 0; i < 4; i++) profile = mergeSession(profile, playedSession(6));

    const total = statsAtOrAbove(profile.mastery, 1);
    expect(total.answered).toBe(24);
    // Enough correct answers at high tiers to have climbed past the start.
    expect(rankFor(profile.mastery).current.id).not.toBe("ashigaru");
  });

  it("keeps the best streak across sessions rather than the latest", () => {
    const big = mergeSession(emptyProfile(), playedSession(7));
    const small = mergeSession(big, playedSession(1));
    expect(small.bestStreak).toBe(big.bestStreak);
  });
});

describe("export — the path out of the browser", () => {
  it("writes one JSON object per line, tagged with its session", async () => {
    const store = memoryStore();
    await store.appendEvents(4, [
      { type: "session_start", ts: 1 },
      { type: "question_served", ts: 2, questionId: "q1", tier: 3 },
    ]);

    const lines = toJsonl(await store.readEvents()).split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.session).toBe(4);
      expect(typeof parsed.type).toBe("string");
    }
  });

  it("produces something the analytics script can actually answer questions from", async () => {
    const store = memoryStore();
    const session = playedSession(5);
    await store.appendEvents(1, session.events);

    const rows = (await store.readEvents()).map((r) => JSON.parse(
      JSON.stringify({ session: r.session, ...r.event }),
    ));
    const answers = rows.filter((r) => r.type === "answer_submitted");
    expect(answers).toHaveLength(5);
    // Both hypothesis inputs are present on the events themselves.
    expect(answers.every((a) => typeof a.latencyMs === "number")).toBe(true);
    expect(answers.every((a) => typeof a.afterPause === "boolean")).toBe(true);
  });
});
