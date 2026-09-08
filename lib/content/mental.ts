import type { Question } from "./schema";

/**
 * Mental arithmetic, generated.
 *
 * The calculus bank is thirty hand-authored questions and that is deliberate —
 * the bank is the product. This drill is the opposite case: the whole point is
 * an endless stream of fresh sums, so authoring cannot work and the questions
 * are generated instead.
 *
 * Everything downstream — the tier selector, ranks, mastery, the dojo, the
 * permalink — consumes `Question[]` and does not care where the array came
 * from. So this file's only job is to emit questions that are honestly valid
 * against the same schema, and the reward is that no other file changes.
 *
 * What is lost by generating is `pnpm validate:content`, which only ever sees
 * files on disk and is the trust guarantee for the authored bank. The
 * replacement is mental.test.ts, which generates a large sample and checks the
 * same invariants: every answer is the arithmetic it claims, every distractor
 * is genuinely wrong, every tier is reachable. That suite is not decoration.
 */

/**
 * Mulberry32. Small, fast, and — the reason it is here rather than
 * Math.random — seedable, so a failing generated question can be reproduced
 * from its seed instead of being a ghost.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intBetween(random: () => number, low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

export const MENTAL_SUBTOPICS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
  "percentages",
  "squares",
] as const;

export type MentalSubtopic = (typeof MENTAL_SUBTOPICS)[number];

interface Spec {
  subtopic: MentalSubtopic;
  prompt: string;
  answer: number;
  /** How a person actually does this one in their head, three rungs deep. */
  hints: [string, string, string];
  steps: { step: string; result?: string }[];
  /** Named slips, each with the wrong answer it produces. */
  slips: { id: string; description: string; wrong: number }[];
}

/* ------------------------------------------------------------------ tier 1 */

function addSmall(random: () => number): Spec {
  const a = intBetween(random, 6, 9);
  const b = intBetween(random, 5, 9);
  return {
    subtopic: "addition",
    prompt: `${a} + ${b}`,
    answer: a + b,
    hints: [
      "Fill the first number up to ten, then carry the rest.",
      `${a} needs ${10 - a} to reach ten, which leaves ${b - (10 - a)} over.`,
      `So ten plus ${b - (10 - a)}.`,
    ],
    steps: [
      { step: `Take ${10 - a} from the ${b}`, result: `${a} + ${10 - a} = 10` },
      { step: `Add what is left`, result: `10 + ${b - (10 - a)} = ${a + b}` },
    ],
    slips: [
      { id: "off-by-one", description: "Counted the bridge to ten one short", wrong: a + b - 1 },
      { id: "off-by-one-high", description: "Counted the bridge to ten one long", wrong: a + b + 1 },
    ],
  };
}

function subSmall(random: () => number): Spec {
  const a = intBetween(random, 11, 18);
  const b = intBetween(random, 4, 9);
  return {
    subtopic: "subtraction",
    prompt: `${a} − ${b}`,
    answer: a - b,
    hints: [
      "Come down to ten first, then take the rest.",
      `${a} down to ten is ${a - 10}, so there is ${b - (a - 10)} still to take.`,
      `Ten minus ${b - (a - 10)}.`,
    ],
    steps: [
      { step: `Drop to ten`, result: `${a} − ${a - 10} = 10` },
      { step: `Take what is left`, result: `10 − ${b - (a - 10)} = ${a - b}` },
    ],
    slips: [
      { id: "reversed", description: "Subtracted in the wrong direction", wrong: b - a },
      { id: "off-by-one", description: "Lost one crossing ten", wrong: a - b - 1 },
    ],
  };
}

/* ------------------------------------------------------------------ tier 2 */

function addTwoDigit(random: () => number): Spec {
  const a = intBetween(random, 21, 68);
  const b = intBetween(random, 21, 68);
  const tens = Math.floor(b / 10) * 10;
  return {
    subtopic: "addition",
    prompt: `${a} + ${b}`,
    answer: a + b,
    hints: [
      "Add the tens, then the units. Never both at once.",
      `${a} + ${tens} = ${a + tens}.`,
      `Now add the last ${b - tens}.`,
    ],
    steps: [
      { step: `Add the tens of ${b}`, result: `${a} + ${tens} = ${a + tens}` },
      { step: `Add the units`, result: `${a + tens} + ${b - tens} = ${a + b}` },
    ],
    slips: [
      { id: "dropped-carry", description: "Dropped a carry out of the units", wrong: a + b - 10 },
      { id: "tens-only", description: "Added the tens and forgot the units", wrong: a + tens },
    ],
  };
}

function timesTable(random: () => number): Spec {
  const a = intBetween(random, 4, 9);
  const b = intBetween(random, 6, 9);
  return {
    subtopic: "multiplication",
    prompt: `${a} × ${b}`,
    answer: a * b,
    hints: [
      "Go to a round number you know and step back.",
      `${a} × 10 = ${a * 10}.`,
      `Now take away ${a} × ${10 - b} = ${a * (10 - b)}.`,
    ],
    steps: [
      { step: `Overshoot to ten`, result: `${a} × 10 = ${a * 10}` },
      { step: `Step back ${10 - b} lots of ${a}`, result: `${a * 10} − ${a * (10 - b)} = ${a * b}` },
    ],
    slips: [
      { id: "one-lot-off", description: "Stepped back one lot too few", wrong: a * (b + 1) },
      { id: "added-instead", description: "Added where the question multiplies", wrong: a + b },
    ],
  };
}

/* ------------------------------------------------------------------ tier 3 */

function subWithBorrow(random: () => number): Spec {
  // Forced borrow: the units of a are strictly smaller than the units of b.
  const aUnits = intBetween(random, 1, 4);
  const bUnits = intBetween(random, aUnits + 1, 9);
  const a = intBetween(random, 4, 9) * 10 + aUnits;
  const b = intBetween(random, 1, Math.floor(a / 10) - 1) * 10 + bUnits;
  const roundB = Math.ceil(b / 10) * 10;
  return {
    subtopic: "subtraction",
    prompt: `${a} − ${b}`,
    answer: a - b,
    hints: [
      "Round what you are taking away up to a ten, then give back the difference.",
      `${a} − ${roundB} = ${a - roundB}.`,
      `You took ${roundB - b} too many, so add ${roundB - b} back.`,
    ],
    steps: [
      { step: `Take a round ${roundB}`, result: `${a} − ${roundB} = ${a - roundB}` },
      { step: `Give back the overshoot`, result: `${a - roundB} + ${roundB - b} = ${a - b}` },
    ],
    slips: [
      { id: "no-borrow", description: "Subtracted the smaller unit from the larger, ignoring the borrow", wrong: Math.floor(a / 10) * 10 - Math.floor(b / 10) * 10 + Math.abs(aUnits - bUnits) },
      { id: "overshoot-kept", description: "Rounded up and forgot to give the difference back", wrong: a - roundB },
    ],
  };
}

function elevens(random: () => number): Spec {
  const a = intBetween(random, 12, 89);
  const tens = Math.floor(a / 10);
  const units = a % 10;
  return {
    subtopic: "multiplication",
    prompt: `${a} × 11`,
    answer: a * 11,
    hints: [
      "Eleven is ten and one, so it is the number shifted plus the number again.",
      `${a} × 10 = ${a * 10}.`,
      `Add one more ${a}.`,
    ],
    steps: [
      { step: `Shift for the ten`, result: `${a} × 10 = ${a * 10}` },
      { step: `Add one more lot`, result: `${a * 10} + ${a} = ${a * 11}` },
    ],
    slips: [
      {
        id: "split-no-carry",
        description: "Used the split-the-digits trick but dropped the carry",
        wrong: tens * 100 + ((tens + units) % 10) * 10 + units,
      },
      { id: "times-ten", description: "Multiplied by ten and stopped", wrong: a * 10 },
    ],
  };
}

/* ------------------------------------------------------------------ tier 4 */

function twoByOne(random: () => number): Spec {
  const a = intBetween(random, 23, 79);
  const b = intBetween(random, 4, 9);
  const tens = Math.floor(a / 10) * 10;
  return {
    subtopic: "multiplication",
    prompt: `${a} × ${b}`,
    answer: a * b,
    hints: [
      "Split the big number into tens and units and multiply each.",
      `${tens} × ${b} = ${tens * b}.`,
      `Now ${a - tens} × ${b} = ${(a - tens) * b}, and add the two.`,
    ],
    steps: [
      { step: `Multiply the tens`, result: `${tens} × ${b} = ${tens * b}` },
      { step: `Multiply the units`, result: `${a - tens} × ${b} = ${(a - tens) * b}` },
      { step: `Add the parts`, result: `${tens * b} + ${(a - tens) * b} = ${a * b}` },
    ],
    slips: [
      { id: "tens-only", description: "Multiplied the tens and forgot the units", wrong: tens * b },
      { id: "units-only", description: "Multiplied the units and forgot the tens", wrong: (a - tens) * b },
    ],
  };
}

function percentage(random: () => number): Spec {
  /*
   * Ten percent is excluded on purpose: the method IS "find ten percent
   * first", so posing it makes the first rung of the ladder the answer.
   */
  const pct = pick(random, [5, 15, 20, 25, 40, 50, 75] as const);
  const base = intBetween(random, 4, 40) * 20;   // every answer stays whole
  const tenth = base / 10;
  const answer = (base * pct) / 100;

  const scale =
    pct === 5
      ? "Halve that."
      : pct === 50
        ? "That is five of them, or just halve the original."
        : `${pct}% is ${pct / 10} of those, so multiply by ${pct / 10}.`;

  return {
    subtopic: "percentages",
    prompt: `${pct}% of ${base}`,
    answer,
    hints: [
      "Find ten percent first — that is just moving the point.",
      `10% of ${base} is ${tenth}.`,
      scale,
    ],
    steps: [
      { step: `Take a tenth`, result: `10% of ${base} = ${tenth}` },
      { step: `Scale to ${pct}%`, result: `${tenth} × ${pct / 10} = ${answer}` },
    ],
    slips: [
      { id: "tenth-only", description: "Stopped at ten percent", wrong: tenth },
      {
        id: "percent-of-percent",
        description: "Divided by the percentage instead of scaling by it",
        wrong: Math.round(base / pct),
      },
    ],
  };
}

function square(random: () => number): Spec {
  /*
   * Never a multiple of ten. The method here is "lean on the nearest round
   * number and correct", and for 30 the nearest round number is itself — the
   * hint degenerates into "you are 0 above it, add 0 then 0", which teaches
   * nothing and looks broken.
   */
  let a = intBetween(random, 11, 39);
  if (a % 10 === 0) a += 1;

  const round = Math.round(a / 10) * 10;
  const d = a - round;
  const cross = 2 * round * d;
  const above = d > 0;

  return {
    subtopic: "squares",
    prompt: `${a}²`,
    answer: a * a,
    hints: [
      "Lean on the nearest round number and correct.",
      `${round}² = ${round * round}, and you are ${Math.abs(d)} ${above ? "above" : "below"} it.`,
      `${above ? "Add" : "Take off"} ${Math.abs(cross)}, then add ${d * d}.`,
    ],
    steps: [
      { step: `Square the round number`, result: `${round}² = ${round * round}` },
      {
        step: above ? `Correct upward` : `Correct downward`,
        result: `${round * round} ${above ? "+" : "−"} ${Math.abs(cross)} + ${d * d} = ${a * a}`,
      },
    ],
    slips: [
      { id: "doubled", description: "Doubled instead of squaring", wrong: a * 2 },
      {
        id: "missing-cross-term",
        description: "Forgot the middle term of the expansion",
        wrong: round * round + d * d,
      },
    ],
  };
}

/* ------------------------------------------------------------------ tier 5 */

function twoByTwo(random: () => number): Spec {
  const a = intBetween(random, 13, 49);
  const b = intBetween(random, 13, 29);
  const bTens = Math.floor(b / 10) * 10;
  return {
    subtopic: "multiplication",
    prompt: `${a} × ${b}`,
    answer: a * b,
    hints: [
      "Break the second number into tens and units.",
      `${a} × ${bTens} = ${a * bTens}.`,
      `Then ${a} × ${b - bTens} = ${a * (b - bTens)}, and add.`,
    ],
    steps: [
      { step: `Multiply by the tens`, result: `${a} × ${bTens} = ${a * bTens}` },
      { step: `Multiply by the units`, result: `${a} × ${b - bTens} = ${a * (b - bTens)}` },
      { step: `Add the parts`, result: `${a * bTens} + ${a * (b - bTens)} = ${a * b}` },
    ],
    slips: [
      { id: "tens-only", description: "Multiplied by the tens and stopped", wrong: a * bTens },
      { id: "dropped-place", description: "Lost a place value on the tens part", wrong: a * (bTens / 10) + a * (b - bTens) },
    ],
  };
}

function divide(random: () => number): Spec {
  const divisor = intBetween(random, 3, 9);
  /*
   * Not a round multiple of ten. The method is "take out tens of the divisor,
   * then share the rest", and a quotient of 40 leaves nothing to share — the
   * last rung becomes "that leaves 0", which reads as a bug.
   */
  let quotient = intBetween(random, 12, 39);
  if (quotient % 10 === 0) quotient += 1;

  const dividend = divisor * quotient;          // exact by construction
  const tens = Math.floor(quotient / 10) * 10;
  const chunk = divisor * tens;
  const rest = dividend - chunk;

  return {
    subtopic: "division",
    prompt: `${dividend} ÷ ${divisor}`,
    answer: quotient,
    hints: [
      "Take out a big round number of lots first, then share what is left.",
      `${divisor} × ${tens} = ${chunk}, which fits inside ${dividend}.`,
      `That leaves ${rest}, and ${rest} ÷ ${divisor} = ${quotient - tens}.`,
    ],
    steps: [
      { step: `Take out ${tens} lots`, result: `${divisor} × ${tens} = ${chunk}` },
      { step: `Share the remainder`, result: `${rest} ÷ ${divisor} = ${quotient - tens}` },
      { step: `Add the lots together`, result: `${tens} + ${quotient - tens} = ${quotient}` },
    ],
    slips: [
      { id: "reversed", description: "Divided the wrong way round", wrong: divisor },
      { id: "off-by-one-lot", description: "One lot of the divisor short", wrong: quotient - 1 },
    ],
  };
}

/** Which generators serve which tier. */
const BY_TIER: Record<number, ((random: () => number) => Spec)[]> = {
  1: [addSmall, subSmall],
  2: [addTwoDigit, timesTable],
  3: [subWithBorrow, elevens],
  4: [twoByOne, percentage, square],
  5: [twoByTwo, divide],
};

/**
 * Distractors have to be wrong, distinct, and non-negative to be worth
 * showing. A slip that happens to land on the right answer for a particular
 * pair of numbers is silently dropped rather than presented as a mistake.
 */
function usableSlips(spec: Spec) {
  const seen = new Set<number>();
  return spec.slips.filter((slip) => {
    if (slip.wrong === spec.answer) return false;
    if (!Number.isFinite(slip.wrong)) return false;
    if (slip.wrong < 0) return false;
    if (seen.has(slip.wrong)) return false;
    seen.add(slip.wrong);
    return true;
  });
}

/**
 * A generic pair of fallback slips, so a question whose named misconceptions
 * collapsed still meets the schema's minimum of two. Off-by-one and
 * off-by-ten are the two things people actually do under time pressure.
 */
function fallbackSlips(spec: Spec, taken: { wrong: number }[]) {
  const used = new Set([spec.answer, ...taken.map((t) => t.wrong)]);
  const out: { id: string; description: string; wrong: number }[] = [];
  for (const [id, description, value] of [
    ["slipped-one", "One out under time pressure", spec.answer + 1],
    ["slipped-ten", "Ten out — a place value lost in the head", spec.answer + 10],
    ["slipped-one-low", "One under", spec.answer - 1],
  ] as const) {
    if (out.length + taken.length >= 2) break;
    if (used.has(value) || value < 0) continue;
    used.add(value);
    out.push({ id, description, wrong: value });
  }
  return out;
}

function toQuestion(spec: Spec, tier: number, index: number): Question {
  const kept = usableSlips(spec);
  const misconceptions = [...kept, ...fallbackSlips(spec, kept)]
    .slice(0, 4)
    .map((slip) => ({
      id: slip.id,
      description: slip.description,
      wrongAnswer: String(slip.wrong),
    }));

  return {
    id: `mm-t${tier}-${index}`,
    topic: "mental-math",
    subtopic: spec.subtopic,
    tier,
    prompt: spec.prompt,
    answerType: "number",
    variables: [],
    canonicalAnswer: String(spec.answer),
    acceptedForms: [],
    workedSolution: spec.steps,
    hints: spec.hints,
    misconceptions,
  };
}

/**
 * Build a drill.
 *
 * `perTier` questions at each of the five tiers, so the selector always has
 * unseen material to widen into and a long session never loops back to a
 * question you have already answered.
 */
export function generateMentalMath(seed = Date.now(), perTier = 40): Question[] {
  const random = rng(seed);
  const out: Question[] = [];

  for (const tier of [1, 2, 3, 4, 5]) {
    const makers = BY_TIER[tier];
    for (let i = 0; i < perTier; i++) {
      const spec = makers[i % makers.length](random);
      out.push(toQuestion(spec, tier, i));
    }
  }

  return out;
}
