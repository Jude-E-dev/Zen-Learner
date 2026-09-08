import { describe, expect, it } from "vitest";
import { loadAll } from "../content/load";
import { startSession, submitAnswer } from "../game/session";
import { rankFor, statsAtOrAbove } from "../game/ranks";
import { emptyProfile, memoryStore, migrate, PROFILE_VERSION } from "./store";
import { defaultAvatar } from "../game/avatar";
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

/**
 * Version 2 added the avatar. This suite exists because the previous migrate()
 * reset any profile whose version did not match exactly, so bumping the
 * version would have silently wiped every learner's rank and streak in
 * exchange for a cosmetic feature.
 */
describe("migrate — upgrading a stored profile", () => {
  const v1 = {
    version: 1,
    totalXp: 420,
    bestStreak: 11,
    mastery: { perTier: { 3: { answered: 20, correct: 17 } } },
    sessions: 6,
    lastSessionAt: 1_700_000_000_000,
  };

  it("carries a version 1 profile forward instead of resetting it", () => {
    const upgraded = migrate(v1);
    expect(upgraded.version).toBe(PROFILE_VERSION);
    expect(upgraded.totalXp).toBe(420);
    expect(upgraded.bestStreak).toBe(11);
    expect(upgraded.sessions).toBe(6);
    expect(upgraded.lastSessionAt).toBe(1_700_000_000_000);
    expect(upgraded.mastery).toEqual(v1.mastery);
  });

  it("gives an upgraded profile the starting avatar", () => {
    expect(migrate(v1).avatar).toEqual(defaultAvatar());
  });

  it("keeps an avatar that is already stored", () => {
    const stored = { ...v1, version: 2, avatar: { hat: "ash", robe: "moss", obi: "gold" } };
    expect(migrate(stored).avatar).toEqual({ hat: "ash", robe: "moss", obi: "gold" });
  });

  it("repairs an avatar naming options that no longer exist", () => {
    const stored = { ...v1, version: 2, avatar: { hat: "sombrero" } };
    expect(migrate(stored).avatar).toEqual(defaultAvatar());
  });

  it("survives a stored mastery of the wrong shape rather than crashing on it", () => {
    // The old code reset on any version mismatch, which guarded this by
    // accident. Carrying profiles forward means the shape is now load-bearing:
    // rankFor reads stats.perTier on mount, so a bad record is a white screen.
    const bad = migrate({ ...v1, mastery: { 5: { answered: 16, correct: 14 } } });
    expect(bad.mastery).toEqual({ perTier: {} });
    expect(() => rankFor(bad.mastery)).not.toThrow();
  });

  it("keeps the good tier records and drops only the broken ones", () => {
    const mixed = migrate({
      ...v1,
      mastery: {
        perTier: {
          3: { answered: 10, correct: 8 },
          4: { answered: "lots", correct: 2 },
          5: null,
        },
      },
    });
    expect(mixed.mastery.perTier).toEqual({ 3: { answered: 10, correct: 8 } });
  });

  it("keeps a well-formed mastery untouched", () => {
    const good = { perTier: { 5: { answered: 16, correct: 14 } } };
    expect(migrate({ ...v1, mastery: good }).mastery).toEqual(good);
  });

  // A version from the future is the one shape this build genuinely cannot read.
  it("starts clean on a version newer than this build", () => {
    const future = migrate({ ...v1, version: PROFILE_VERSION + 1 });
    expect(future.totalXp).toBe(0);
    expect(future.sessions).toBe(0);
  });

  it.each([null, undefined, "profile", 3, {}])(
    "starts clean on unreadable input (%s)",
    (input) => {
      expect(migrate(input).totalXp).toBe(0);
    },
  );
});
