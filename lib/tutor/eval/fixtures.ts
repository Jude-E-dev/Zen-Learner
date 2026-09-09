import type { Question } from "../../content/schema";
import { MAX_RUNG } from "../prompt";

/**
 * The eval set: (question, wrong answer, matched misconception, rung).
 *
 * Derived from the real bank rather than written by hand. Every authored
 * question already carries two to four named misconceptions, each with the
 * wrong answer it produces — which is exactly the fixture shape design doc #12
 * asks for. Hand-copying them into a second list would mean an eval that
 * silently stops matching the content it is meant to be evaluating.
 *
 * The selection is spread across tiers and rungs on purpose. A suite that only
 * probes rung 1 on tier 1 questions tests the easiest thing the tutor does.
 */

export interface Fixture {
  id: string;
  question: Question;
  rung: number;
  wrongAnswer: string;
  misconceptionId?: string;
  /** What this fixture is here to catch. */
  probes: string;
}

/**
 * Spread the rungs deterministically rather than randomly, so a failure is
 * reproducible and two runs are comparable.
 */
function rungFor(index: number): number {
  return (index % MAX_RUNG) + 1;
}

export function buildFixtures(pool: Question[]): Fixture[] {
  const fixtures: Fixture[] = [];

  // One per tier per misconception, walking tiers so the set stays spread.
  const byTier = [1, 2, 3, 4, 5].map((tier) => pool.filter((q) => q.tier === tier));

  let index = 0;
  for (let round = 0; round < 4; round++) {
    for (const tierPool of byTier) {
      const question = tierPool[round % Math.max(1, tierPool.length)];
      if (!question) continue;
      const misconception = question.misconceptions[round % question.misconceptions.length];
      if (!misconception) continue;

      const id = `${question.id}::${misconception.id}::r${rungFor(index)}`;
      if (fixtures.some((f) => f.id === id)) continue;

      fixtures.push({
        id,
        question,
        rung: rungFor(index),
        wrongAnswer: misconception.wrongAnswer,
        misconceptionId: misconception.id,
        probes: `tier ${question.tier}, ${misconception.id}, rung ${rungFor(index)}`,
      });
      index += 1;
    }
  }

  /*
   * Two fixtures the bank cannot produce on its own.
   *
   * An unmatched wrong answer is the common case in real use — most mistakes
   * are not one of the two to four named ones — and it is the case where the
   * prompt is most tempted to invent a diagnosis to fill the empty slot.
   *
   * The last rung is the other. It is the point where the model has the most
   * context and the least ladder left, and where a reply is most tempted to
   * summarise its way to the answer — an earlier version of the prompt handed
   * it the worked solution here and it leaked outright, twice.
   */
  const first = pool[0];
  if (first) {
    fixtures.push({
      id: `${first.id}::unmatched::r1`,
      question: first,
      rung: 1,
      wrongAnswer: "42",
      probes: "an unmatched wrong answer — must not invent a diagnosis",
    });
  }

  const hard = pool.find((q) => q.tier >= 4) ?? pool[pool.length - 1];
  if (hard) {
    fixtures.push({
      id: `${hard.id}::ladder-end::r${MAX_RUNG}`,
      question: hard,
      rung: MAX_RUNG,
      wrongAnswer: hard.misconceptions[0]?.wrongAnswer ?? "0",
      misconceptionId: hard.misconceptions[0]?.id,
      probes: "the last rung — the most tempting place to summarise to the answer",
    });
  }

  return fixtures;
}
