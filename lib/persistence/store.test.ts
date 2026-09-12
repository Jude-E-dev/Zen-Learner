import { describe, expect, it } from "vitest";
import { loadAll } from "../content/load";
import { startSession, submitAnswer } from "../game/session";
import { rankFor, statsAtOrAbove } from "../game/ranks";
import {
  emptyProfile,
  memoryStore,
  migrate,
  PROFILE_VERSION,
  RETAINED_SESSIONS,
  retentionCutoff,
  type Store,
} from "./store";
import type { GameEvent } from "../game/events";
import { defaultAvatar } from "../game/avatar";
import { mergeSession, toJsonl } from "./profile";
import { localDay } from "../tutor/quota";

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

/**
 * Nothing used to remove an event, so the store grew for the life of the
 * browser profile and eventually competed with the progress record for the
 * origin's storage quota. These pin the ring buffer: bounded, newest-kept, and
 * never holding half a session — a session cut across the boundary would still
 * be summarised as a session and would quietly flatten the novelty curve.
 */
describe("events — rotation keeps the store bounded", () => {
  const EVENTS_PER_SESSION = 5;

  async function play(store: Store, session: number) {
    const base = session * 1_000_000;
    const events: GameEvent[] = [{ type: "session_start", ts: base }];
    for (let i = 0; i < EVENTS_PER_SESSION - 2; i++) {
      events.push({
        type: "answer_submitted",
        ts: base + i,
        questionId: `q${i}`,
        tier: 1,
        verdict: "correct",
        latencyMs: 1000,
        afterPause: false,
      });
    }
    events.push({ type: "session_end", ts: base + 999, answered: 3, correct: 3, xp: 30 });
    await store.appendEvents(session, events);
  }

  async function playThrough(last: number) {
    const store = memoryStore();
    for (let session = 1; session <= last; session++) await play(store, session);
    return store.readEvents();
  }

  const sessionsIn = (rows: { session: number }[]) => [...new Set(rows.map((r) => r.session))];

  it("keeps every session while the learner is under the cap", async () => {
    const rows = await playThrough(RETAINED_SESSIONS);
    expect(sessionsIn(rows)).toHaveLength(RETAINED_SESSIONS);
    expect(rows).toHaveLength(RETAINED_SESSIONS * EVENTS_PER_SESSION);
  });

  it("stays bounded however long the learner keeps playing", async () => {
    const rows = await playThrough(RETAINED_SESSIONS * 3);
    expect(sessionsIn(rows)).toHaveLength(RETAINED_SESSIONS);
    expect(rows).toHaveLength(RETAINED_SESSIONS * EVENTS_PER_SESSION);
  });

  it("drops the oldest sessions and keeps the newest", async () => {
    const last = RETAINED_SESSIONS + 7;
    const sessions = sessionsIn(await playThrough(last));
    expect(Math.max(...sessions)).toBe(last);
    expect(Math.min(...sessions)).toBe(last - RETAINED_SESSIONS + 1);
    expect(sessions).not.toContain(1);
  });

  it("never keeps half a session, least of all the one on the boundary", async () => {
    const rows = await playThrough(RETAINED_SESSIONS + 7);
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(row.session, (counts.get(row.session) ?? 0) + 1);

    for (const [session, count] of counts) {
      expect(count, `session ${session} was cut short`).toBe(EVENTS_PER_SESSION);
    }
    // The oldest retained session is the one rotation stopped at — whole.
    expect(counts.get(Math.min(...counts.keys()))).toBe(EVENTS_PER_SESSION);
  });

  it("keeps the whole window readable in session order", async () => {
    const rows = await playThrough(RETAINED_SESSIONS + 2);
    const order = rows.map((r) => r.session);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  /*
   * The session number is the unit, not the batch. A session that commits its
   * events in two batches must still count once, or a chatty session would
   * evict older ones that are still inside the window.
   */
  it("counts a session once even when its events arrive in several batches", async () => {
    const store = memoryStore();
    for (let session = 1; session <= RETAINED_SESSIONS; session++) await play(store, session);
    await store.appendEvents(RETAINED_SESSIONS, [{ type: "session_start", ts: 1 }]);
    await store.appendEvents(RETAINED_SESSIONS, [{ type: "session_start", ts: 2 }]);

    const rows = await store.readEvents();
    expect(sessionsIn(rows)).toHaveLength(RETAINED_SESSIONS);
    expect(sessionsIn(rows)).toContain(1);
  });

  it("rotates on the shared rule rather than one of the fallback's own", async () => {
    const last = RETAINED_SESSIONS + 4;
    const rows = await playThrough(last);
    const played = Array.from({ length: last }, (_, i) => i + 1);
    expect(Math.min(...rows.map((r) => r.session))).toBe(retentionCutoff(played));
  });

  it("appending nothing neither rotates nor records a session", async () => {
    const store = memoryStore();
    await play(store, 1);
    await store.appendEvents(2, []);
    expect(sessionsIn(await store.readEvents())).toEqual([1]);
  });

  it("leaves the session-1 vs session-5 comparison intact, which is the point", async () => {
    const sessions = sessionsIn(await playThrough(RETAINED_SESSIONS));
    expect(sessions).toContain(1);
    expect(sessions).toContain(5);
  });
});

describe("retentionCutoff — which sessions age out", () => {
  it("drops nothing at or under the cap", () => {
    expect(retentionCutoff([], 3)).toBeNull();
    expect(retentionCutoff([1, 2, 3], 3)).toBeNull();
  });

  it("names the oldest session to keep once the cap is passed", () => {
    expect(retentionCutoff([1, 2, 3, 4, 5], 3)).toBe(3);
  });

  it("counts sessions, not events, so a long session does not evict others", () => {
    expect(retentionCutoff([1, 1, 1, 1, 1, 2, 2, 2], 3)).toBeNull();
  });

  it("works on session numbers with gaps, without assuming they are contiguous", () => {
    // A store whose earlier sessions were already rotated away, or a profile
    // whose counter ran ahead of the events it kept.
    expect(retentionCutoff([9, 3, 40, 12], 2)).toBe(12);
  });

  it("defaults to the retention window the store actually uses", () => {
    const many = Array.from({ length: RETAINED_SESSIONS + 1 }, (_, i) => i + 1);
    expect(retentionCutoff(many)).toBe(2);
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
    const kit = { hat: "ash", robe: "moss", obi: "gold", hakama: "rust" };
    expect(migrate({ ...v1, version: 2, avatar: kit }).avatar).toEqual(kit);
  });

  // The hakama slot arrived with the redrawn sprite, after profiles already
  // existed. Those keep the kit they chose and gain the new slot's default.
  it("fills in a slot that did not exist when the avatar was saved", () => {
    const stored = { ...v1, version: 2, avatar: { hat: "ash", robe: "moss", obi: "gold" } };
    expect(migrate(stored).avatar).toEqual({
      hat: "ash",
      robe: "moss",
      obi: "gold",
      hakama: "olive",
    });
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

  /*
   * Version 3 added the daily pause quota (design doc constraint #4). Same
   * rule as the avatar: a profile from before it existed gets a generous
   * default rather than being treated as exhausted, and a profile that already
   * has one keeps it exactly rather than being re-derived.
   */
  it("gives a version 1 profile without a pauseQuota the generous default (nothing spent today)", () => {
    const upgraded = migrate(v1);
    expect(upgraded.pauseQuota.used).toBe(0);
    expect(upgraded.pauseQuota.day).toBe(localDay());
  });

  it("gives a version 2 profile without a pauseQuota the same generous default", () => {
    const v2 = { ...v1, version: 2, avatar: defaultAvatar() };
    const upgraded = migrate(v2);
    expect(upgraded.pauseQuota).toEqual({ day: localDay(), used: 0 });
  });

  it("keeps a version 3 profile's existing pauseQuota untouched", () => {
    const stored = {
      ...v1,
      version: 3,
      avatar: defaultAvatar(),
      pauseQuota: { day: "2020-01-01", used: 3 },
    };
    expect(migrate(stored).pauseQuota).toEqual({ day: "2020-01-01", used: 3 });
  });

  it("repairs a pauseQuota of the wrong shape rather than crashing on it", () => {
    const stored = { ...v1, version: 3, avatar: defaultAvatar(), pauseQuota: { used: -5 } };
    expect(migrate(stored).pauseQuota).toEqual({ day: localDay(), used: 0 });
  });
});
