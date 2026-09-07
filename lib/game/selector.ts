import type { Question } from "../content/schema";

/**
 * Difficulty selection: mastery in, mastery out.
 *
 * Ranks gate on demonstrated accuracy at a tier, so the tier you are sitting at
 * has to mean something. Three right in a row promotes, two wrong demotes, and
 * unreadable input moves nothing at all — a typo must never cost a tier.
 *
 *        ┌──────────── 3 correct in a row ───────────┐
 *        │                                           v
 *   [ tier n-1 ] <──── 2 wrong at tier ──── [ tier n ] ────> [ tier n+1 ]
 *        ^                                                        │
 *        └──────────────── 2 wrong at tier ───────────────────────┘
 *
 *   tier 1: demotion clamps (streak resets, tier holds)
 *   tier 5: promotion clamps (learner is tracked "at cap")
 */

export const MIN_TIER = 1;
export const MAX_TIER = 5;
export const PROMOTE_AFTER = 3;
export const DEMOTE_AFTER = 2;

export interface SelectorState {
  tier: number;
  /** Consecutive correct answers at the current tier. */
  correctStreak: number;
  /** Consecutive wrong answers at the current tier. */
  wrongStreak: number;
  /** Question ids already served this session, oldest first. */
  served: string[];
  /** True once the learner has hit tier 5 and stayed there. */
  atCap: boolean;
}

export function initialSelector(startTier = 1): SelectorState {
  return {
    tier: Math.min(MAX_TIER, Math.max(MIN_TIER, startTier)),
    correctStreak: 0,
    wrongStreak: 0,
    served: [],
    atCap: false,
  };
}

export type TierMove = "promoted" | "demoted" | "held" | "at-cap" | "at-floor";

export interface TierResult {
  state: SelectorState;
  move: TierMove;
}

/**
 * Fold one graded answer into the tier state. `unreadable` is deliberately
 * absent from the signature's effects: callers pass it and nothing moves.
 */
export function applyVerdict(
  state: SelectorState,
  verdict: "correct" | "incorrect" | "unreadable",
): TierResult {
  if (verdict === "unreadable") return { state, move: "held" };

  if (verdict === "correct") {
    const correctStreak = state.correctStreak + 1;
    if (correctStreak < PROMOTE_AFTER) {
      return {
        state: { ...state, correctStreak, wrongStreak: 0 },
        move: "held",
      };
    }
    if (state.tier >= MAX_TIER) {
      // Nowhere to promote to. Reset the streak so the learner can earn the
      // moment again rather than sitting on a frozen counter.
      return {
        state: { ...state, correctStreak: 0, wrongStreak: 0, atCap: true },
        move: "at-cap",
      };
    }
    return {
      state: {
        ...state,
        tier: state.tier + 1,
        correctStreak: 0,
        wrongStreak: 0,
      },
      move: "promoted",
    };
  }

  const wrongStreak = state.wrongStreak + 1;
  if (wrongStreak < DEMOTE_AFTER) {
    return { state: { ...state, wrongStreak, correctStreak: 0 }, move: "held" };
  }
  if (state.tier <= MIN_TIER) {
    return {
      state: { ...state, correctStreak: 0, wrongStreak: 0 },
      move: "at-floor",
    };
  }
  return {
    state: {
      ...state,
      tier: state.tier - 1,
      correctStreak: 0,
      wrongStreak: 0,
    },
    move: "demoted",
  };
}

/**
 * Pick the next question.
 *
 * Design-doc open question 2, resolved here: when a tier runs out of unseen
 * questions we widen to the nearest tier rather than repeating, because
 * repeating turns the mastery gate into a memory test. Repeats are the last
 * resort, and then we serve the least-recently-seen question so a short bank
 * still feels like a stream rather than a loop.
 */
export function selectQuestion(
  state: SelectorState,
  pool: Question[],
): Question | null {
  if (pool.length === 0) return null;

  const seen = new Set(state.served);
  const unseenAt = (tier: number) =>
    pool.filter((q) => q.tier === tier && !seen.has(q.id));

  const atTier = unseenAt(state.tier);
  if (atTier.length > 0) return atTier[0];

  // Widen outward: tier-1, tier+1, tier-2, tier+2, ...
  for (let distance = 1; distance <= MAX_TIER; distance++) {
    for (const tier of [state.tier - distance, state.tier + distance]) {
      if (tier < MIN_TIER || tier > MAX_TIER) continue;
      const candidates = unseenAt(tier);
      if (candidates.length > 0) return candidates[0];
    }
  }

  // Everything has been seen. Serve the least recently served, preferring the
  // current tier so difficulty still tracks the learner.
  const rank = (q: Question) => {
    const idx = state.served.lastIndexOf(q.id);
    return idx === -1 ? -1 : idx;
  };
  const sorted = [...pool].sort((a, b) => {
    const tierDelta =
      Math.abs(a.tier - state.tier) - Math.abs(b.tier - state.tier);
    if (tierDelta !== 0) return tierDelta;
    return rank(a) - rank(b);
  });
  return sorted[0] ?? null;
}

export function markServed(state: SelectorState, id: string): SelectorState {
  return { ...state, served: [...state.served, id] };
}
