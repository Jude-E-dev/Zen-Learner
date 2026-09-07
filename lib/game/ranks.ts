/**
 * Ranks are gated on demonstrated accuracy at a difficulty tier, never on
 * cumulative XP (design doc constraint #5). You cannot grind your way up by
 * farming tier-1 questions: every rank names a tier floor, and only answers at
 * or above that floor count toward it.
 *
 * This file is the whole rank definition. Renaming a rank or retuning a
 * threshold is a one-line edit here and nothing else changes — the names below
 * are a starting proposal, not a decision the code depends on.
 */

export interface Rank {
  id: string;
  name: string;
  /** Only answers at this tier or above count toward this rank. */
  tierFloor: number;
  /** Correct answers required at or above the tier floor. */
  correctRequired: number;
  /** Accuracy required at or above the tier floor, 0-1. */
  accuracyRequired: number;
  /** One line shown to the learner explaining what this rank means. */
  blurb: string;
}

export const RANKS: Rank[] = [
  {
    id: "ashigaru",
    name: "Ashigaru",
    tierFloor: 1,
    correctRequired: 0,
    accuracyRequired: 0,
    blurb: "You picked up the blade.",
  },
  {
    id: "bushi",
    name: "Bushi",
    tierFloor: 2,
    correctRequired: 5,
    accuracyRequired: 0.6,
    blurb: "Steady at tier 2 and above.",
  },
  {
    id: "ronin",
    name: "Ronin",
    tierFloor: 3,
    correctRequired: 8,
    accuracyRequired: 0.65,
    blurb: "Masterless. Tier 3 answered on your own terms.",
  },
  {
    id: "samurai",
    name: "Samurai",
    tierFloor: 4,
    correctRequired: 10,
    accuracyRequired: 0.7,
    blurb: "Tier 4 holds no fear.",
  },
  {
    id: "kensei",
    name: "Kensei",
    tierFloor: 5,
    correctRequired: 12,
    accuracyRequired: 0.75,
    blurb: "Sword saint. The top tier, held.",
  },
];

export interface TierRecord {
  answered: number;
  correct: number;
}

/** Lifetime accuracy per difficulty tier, accumulated across sessions. */
export interface MasteryStats {
  perTier: Record<number, TierRecord>;
}

export function emptyMastery(): MasteryStats {
  return { perTier: {} };
}

export function recordAnswer(
  stats: MasteryStats,
  tier: number,
  correct: boolean,
): MasteryStats {
  const prior = stats.perTier[tier] ?? { answered: 0, correct: 0 };
  return {
    perTier: {
      ...stats.perTier,
      [tier]: {
        answered: prior.answered + 1,
        correct: prior.correct + (correct ? 1 : 0),
      },
    },
  };
}

/** Totals at or above a tier floor — the only numbers a rank looks at. */
export function statsAtOrAbove(stats: MasteryStats, tierFloor: number): TierRecord {
  return Object.entries(stats.perTier).reduce<TierRecord>(
    (acc, [tier, record]) => {
      if (Number(tier) < tierFloor) return acc;
      return {
        answered: acc.answered + record.answered,
        correct: acc.correct + record.correct,
      };
    },
    { answered: 0, correct: 0 },
  );
}

export function meetsRank(stats: MasteryStats, rank: Rank): boolean {
  const at = statsAtOrAbove(stats, rank.tierFloor);
  if (at.correct < rank.correctRequired) return false;
  if (at.answered === 0) return rank.correctRequired === 0;
  return at.correct / at.answered >= rank.accuracyRequired;
}

export interface RankProgress {
  current: Rank;
  next: Rank | null;
  /** Correct answers at the next rank's tier floor, and how many are needed. */
  correct: number;
  correctRequired: number;
  /** Accuracy at the next rank's tier floor, and what it must reach. */
  accuracy: number | null;
  accuracyRequired: number;
}

/**
 * Highest rank whose bar is currently cleared. Ranks are re-derived from
 * lifetime stats rather than stored, so a rank can never drift out of sync with
 * the accuracy that earned it.
 */
export function rankFor(stats: MasteryStats): RankProgress {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (meetsRank(stats, rank)) current = rank;
  }

  const next = RANKS[RANKS.indexOf(current) + 1] ?? null;
  if (!next) {
    return {
      current,
      next: null,
      correct: 0,
      correctRequired: 0,
      accuracy: null,
      accuracyRequired: 0,
    };
  }

  const at = statsAtOrAbove(stats, next.tierFloor);
  return {
    current,
    next,
    correct: at.correct,
    correctRequired: next.correctRequired,
    accuracy: at.answered === 0 ? null : at.correct / at.answered,
    accuracyRequired: next.accuracyRequired,
  };
}
