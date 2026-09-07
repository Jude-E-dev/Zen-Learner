import { describe, expect, it } from "vitest";
import { loadAll } from "../content/load";
import {
  RANKS,
  emptyMastery,
  meetsRank,
  rankFor,
  recordAnswer,
  statsAtOrAbove,
  type MasteryStats,
} from "./ranks";
import { startSession, submitAnswer } from "./session";
import { masteryWithSession } from "../persistence/profile";

const pool = loadAll().flatMap((f) => f.questions);

function mastery(entries: Array<[tier: number, correct: number, wrong: number]>) {
  let stats: MasteryStats = emptyMastery();
  for (const [tier, correct, wrong] of entries) {
    for (let i = 0; i < correct; i++) stats = recordAnswer(stats, tier, true);
    for (let i = 0; i < wrong; i++) stats = recordAnswer(stats, tier, false);
  }
  return stats;
}

describe("ranks — the mastery gate", () => {
  it("starts everyone at the first rank", () => {
    expect(rankFor(emptyMastery()).current.id).toBe("ashigaru");
  });

  it("cannot be climbed by farming easy questions", () => {
    // A hundred perfect tier-1 answers. This is the exact thing the gate exists
    // to refuse.
    const grinder = mastery([[1, 100, 0]]);
    expect(rankFor(grinder).current.id).toBe("ashigaru");
  });

  it("promotes on accuracy at the required tier", () => {
    const earned = mastery([[2, 6, 2]]); // 6/8 at tier 2 = 75%
    expect(rankFor(earned).current.id).toBe("bushi");
  });

  it("refuses a rank when the volume is there but the accuracy is not", () => {
    const sloppy = mastery([[2, 6, 20]]); // plenty correct, 23% accuracy
    expect(meetsRank(sloppy, RANKS[1])).toBe(false);
    expect(rankFor(sloppy).current.id).toBe("ashigaru");
  });

  it("refuses a rank when the accuracy is there but the volume is not", () => {
    const untested = mastery([[2, 2, 0]]); // perfect, but only two answers
    expect(meetsRank(untested, RANKS[1])).toBe(false);
  });

  it("counts higher tiers toward lower-tier rank requirements", () => {
    // Answers at tier 4 are at or above the tier-2 floor, so they count.
    const deep = mastery([[4, 6, 1]]);
    expect(statsAtOrAbove(deep, 2)).toEqual({ answered: 7, correct: 6 });
    expect(meetsRank(deep, RANKS[1])).toBe(true);
  });

  it("does not count lower tiers toward higher-tier ranks", () => {
    const shallow = mastery([[2, 50, 0]]);
    expect(statsAtOrAbove(shallow, 4)).toEqual({ answered: 0, correct: 0 });
    expect(meetsRank(shallow, RANKS[3])).toBe(false);
  });

  it("reaches the top rank only on sustained tier-5 accuracy", () => {
    const kensei = mastery([[5, 15, 3]]); // 15/18 = 83%
    expect(rankFor(kensei).current.id).toBe("kensei");
    expect(rankFor(kensei).next).toBeNull();
  });

  it("reports concrete progress toward the next rank", () => {
    const progress = rankFor(mastery([[2, 3, 1]]));
    expect(progress.current.id).toBe("ashigaru");
    expect(progress.next?.id).toBe("bushi");
    expect(progress.correct).toBe(3);
    expect(progress.correctRequired).toBe(5);
    expect(progress.accuracy).toBeCloseTo(0.75);
  });

  it("keeps every rank strictly harder than the one before it", () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].tierFloor).toBeGreaterThanOrEqual(RANKS[i - 1].tierFloor);
      expect(RANKS[i].correctRequired).toBeGreaterThan(RANKS[i - 1].correctRequired);
      expect(RANKS[i].accuracyRequired).toBeGreaterThanOrEqual(
        RANKS[i - 1].accuracyRequired,
      );
    }
  });
});

describe("ranks — folding a played session in", () => {
  it("counts answers from real play", () => {
    let s = startSession(pool, 0);
    for (let i = 0; i < 6; i++) {
      s = submitAnswer(s, s.current!.canonicalAnswer, pool, i * 1000);
    }
    const stats = masteryWithSession(emptyMastery(), s);
    const total = statsAtOrAbove(stats, 1);
    expect(total).toEqual({ answered: 6, correct: 6 });
  });

  it("never lets unreadable input touch lifetime accuracy", () => {
    let s = startSession(pool, 0);
    s = submitAnswer(s, s.current!.canonicalAnswer, pool, 1000);
    for (let i = 0; i < 10; i++) s = submitAnswer(s, "((", pool, 2000 + i);

    const stats = masteryWithSession(emptyMastery(), s);
    // One real answer, ten typos, and the record shows exactly one attempt.
    expect(statsAtOrAbove(stats, 1)).toEqual({ answered: 1, correct: 1 });
  });
});
