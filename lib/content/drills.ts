import questionData from "./generated.json";
import { generateMentalMath, MENTAL_SUBTOPICS } from "./mental";
import type { Question, Topic } from "./schema";

/**
 * The drills on offer.
 *
 * Two of them now, and they are different in kind rather than in subject. The
 * calculus bank is thirty hand-authored questions, validated at build time,
 * and running out of them is a real edge the selector has to handle. Mental
 * math is generated fresh every session and never runs out.
 *
 * Everything downstream takes `Question[]`, so this is the only place that
 * knows the difference.
 */

const CALCULUS_POOL = questionData as unknown as Question[];

export interface Drill {
  id: Topic;
  name: string;
  /** One line under the name, on the card. */
  blurb: string;
  subtopics: string[];
  /** How many questions there are, or null when the supply is endless. */
  size: number | null;
  /**
   * Whether the drill is about speed.
   *
   * Deliberately NOT wired into XP. Ranks are gated on demonstrated accuracy
   * at a tier and never on volume (design doc constraint #5), so paying XP for
   * speed would hand back exactly the grind the mastery gate exists to
   * prevent — rush the easy tier, bank the bonus. Speed gets its own feedback
   * instead: a clock while you answer, and your times on the card at the end.
   */
  timed: boolean;
  /** Per-tier question counts, or null when the supply is endless. */
  tierCounts: number[] | null;
  pool(seed?: number): Question[];
}

export const DRILLS: Drill[] = [
  {
    id: "calculus",
    name: "CALCULUS",
    blurb: "Authored questions, one at a time, with no clock running.",
    subtopics: [...new Set(CALCULUS_POOL.map((q) => q.subtopic))].sort(),
    size: CALCULUS_POOL.length,
    timed: false,
    tierCounts: [1, 2, 3, 4, 5].map(
      (tier) => CALCULUS_POOL.filter((q) => q.tier === tier).length,
    ),
    pool: () => CALCULUS_POOL,
  },
  {
    id: "mental-math",
    name: "MENTAL MATH",
    blurb: "Arithmetic against the clock. Generated fresh, so it never repeats.",
    subtopics: [...MENTAL_SUBTOPICS],
    size: null,
    timed: true,
    tierCounts: null,
    pool: (seed = Date.now()) => generateMentalMath(seed),
  },
];

export const DEFAULT_DRILL = DRILLS[0];

/** Resolve a drill id from a URL, falling back rather than failing. */
export function drillFor(id: string | null | undefined): Drill {
  return DRILLS.find((drill) => drill.id === id) ?? DEFAULT_DRILL;
}
