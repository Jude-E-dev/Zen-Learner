import { describe, expect, it } from "vitest";
import { notStarted } from "./RankBar";
import { emptyMastery, rankFor, recordAnswer } from "@/lib/game/ranks";

describe("notStarted", () => {
  it("is true for a fresh learner, whose bars would both be empty", () => {
    expect(notStarted(rankFor(emptyMastery()))).toBe(true);
  });

  it("stays true while every answer is below the next rank's floor", () => {
    // Tier 1 answers, and the next rank counts tier 2 and above — the state
    // the bar spends a first session in, and the one that read as a skeleton.
    let mastery = emptyMastery();
    for (let i = 0; i < 20; i++) mastery = recordAnswer(mastery, 1, true);

    const rank = rankFor(mastery);
    expect(rank.next?.tierFloor).toBe(2);
    expect(notStarted(rank)).toBe(true);
  });

  it("is false once anything is answered at the floor, right or wrong", () => {
    const wrong = rankFor(recordAnswer(emptyMastery(), 2, false));
    expect(wrong.correct).toBe(0);
    // Nothing correct yet, but there is real progress to report, so the bars
    // stay and their labels carry the numbers.
    expect(notStarted(wrong)).toBe(false);

    expect(notStarted(rankFor(recordAnswer(emptyMastery(), 2, true)))).toBe(false);
  });

  it("is false at the top rank, which has no bars at all", () => {
    let mastery = emptyMastery();
    for (let i = 0; i < 40; i++) mastery = recordAnswer(mastery, 5, true);

    const rank = rankFor(mastery);
    expect(rank.next).toBeNull();
    expect(notStarted(rank)).toBe(false);
  });
});
