import { describe, expect, it } from "vitest";
import { generateMentalMath, MENTAL_SUBTOPICS } from "./mental";
import { QuestionSchema } from "./schema";
import { checkAnswer } from "../equivalence/check";

/**
 * This suite is the mental-math equivalent of `pnpm validate:content`.
 *
 * The authored calculus bank is checked at build time: every answer key is
 * graded against its own worked solution, and any distractor that is secretly
 * correct fails the build. Generated questions never touch that validator,
 * because it only ever sees files on disk. So the same guarantees have to be
 * made here, over a large sample, or the drill has no safety net at all.
 *
 * A wide sample rather than a token one: the generators pick numbers at
 * random, and the interesting failures (a borrow that does not borrow, a
 * distractor that collides with the answer, a percentage that is not whole)
 * only show up across many draws.
 */

const SAMPLE_SEEDS = [1, 7, 42, 1337, 90210, 2026];
const wide = SAMPLE_SEEDS.flatMap((seed) => generateMentalMath(seed, 30));

/** The arithmetic the prompt is actually asking for, done independently. */
function evaluatePrompt(prompt: string): number {
  const square = prompt.match(/^(\d+)²$/);
  if (square) return Number(square[1]) ** 2;

  const percent = prompt.match(/^(\d+)% of (\d+)$/);
  if (percent) return (Number(percent[1]) * Number(percent[2])) / 100;

  const binary = prompt.match(/^(\d+) ([+−×÷]) (\d+)$/);
  if (!binary) throw new Error(`unparseable prompt: ${prompt}`);
  const [, left, op, right] = binary;
  const a = Number(left);
  const b = Number(right);
  switch (op) {
    case "+": return a + b;
    case "−": return a - b;
    case "×": return a * b;
    case "÷": return a / b;
    default: throw new Error(`unknown operator: ${op}`);
  }
}

describe("mental math — shape", () => {
  it("produces a large, schema-valid bank", () => {
    const pool = generateMentalMath(11, 40);
    expect(pool).toHaveLength(200);
    for (const question of pool) {
      const parsed = QuestionSchema.safeParse(question);
      expect(parsed.success, `${question.id} (${question.prompt}) failed the schema`).toBe(true);
    }
  });

  it("fills every tier, so no tier is a dead end for the selector", () => {
    const pool = generateMentalMath(3, 40);
    for (const tier of [1, 2, 3, 4, 5]) {
      expect(pool.filter((q) => q.tier === tier).length).toBe(40);
    }
  });

  it("gives every question a unique id", () => {
    const pool = generateMentalMath(5, 40);
    expect(new Set(pool.map((q) => q.id)).size).toBe(pool.length);
  });

  it("only uses subtopics it declares", () => {
    for (const q of wide) {
      expect(MENTAL_SUBTOPICS).toContain(q.subtopic as (typeof MENTAL_SUBTOPICS)[number]);
    }
  });

  it("is reproducible from its seed", () => {
    expect(generateMentalMath(99, 10)).toEqual(generateMentalMath(99, 10));
  });

  it("gives different seeds different questions", () => {
    const a = generateMentalMath(1, 10).map((q) => q.prompt);
    const b = generateMentalMath(2, 10).map((q) => q.prompt);
    expect(a).not.toEqual(b);
  });
});

/*
 * The part that actually matters. A generator that emits a wrong answer is
 * worse than no drill at all: it teaches the wrong thing and blames the
 * learner for it.
 */
describe("mental math — the answer is the arithmetic", () => {
  it("every canonical answer equals the prompt it claims to solve", () => {
    for (const q of wide) {
      expect(
        Number(q.canonicalAnswer),
        `${q.id}: "${q.prompt}" claims ${q.canonicalAnswer}`,
      ).toBe(evaluatePrompt(q.prompt));
    }
  });

  it("every answer is a whole number", () => {
    for (const q of wide) {
      expect(Number.isInteger(Number(q.canonicalAnswer)), `${q.prompt} = ${q.canonicalAnswer}`).toBe(true);
    }
  });

  it("no answer is negative", () => {
    for (const q of wide) {
      expect(Number(q.canonicalAnswer), q.prompt).toBeGreaterThanOrEqual(0);
    }
  });

  it("the last worked step lands on the answer", () => {
    for (const q of wide) {
      const last = q.workedSolution[q.workedSolution.length - 1];
      const result = last.result ?? "";
      const final = result.includes("=") ? result.split("=").pop()!.trim() : result.trim();
      expect(final, `${q.id}: "${q.prompt}" ends on "${final}" but answers ${q.canonicalAnswer}`).toBe(
        q.canonicalAnswer,
      );
    }
  });

  it("the real checker grades the canonical answer as correct", () => {
    // Not a tautology: this is the same path a learner's keystrokes take.
    for (const q of wide.slice(0, 300)) {
      expect(checkAnswer(q.canonicalAnswer, q).verdict, `${q.prompt}`).toBe("correct");
    }
  });
});

describe("mental math — distractors are genuinely wrong", () => {
  it("no misconception's wrong answer is secretly correct", () => {
    for (const q of wide) {
      for (const m of q.misconceptions) {
        expect(
          Number(m.wrongAnswer),
          `${q.id}: "${q.prompt}" offers ${m.wrongAnswer} as the "${m.id}" slip, but that is the answer`,
        ).not.toBe(Number(q.canonicalAnswer));
      }
    }
  });

  it("the real checker grades every distractor as incorrect", () => {
    for (const q of wide.slice(0, 300)) {
      for (const m of q.misconceptions) {
        expect(checkAnswer(m.wrongAnswer, q).verdict, `${q.prompt} / ${m.wrongAnswer}`).toBe(
          "incorrect",
        );
      }
    }
  });

  it("distractors are distinct within a question", () => {
    for (const q of wide) {
      const values = q.misconceptions.map((m) => m.wrongAnswer);
      expect(new Set(values).size, `${q.id} repeats a distractor`).toBe(values.length);
    }
  });

  it("no distractor is negative, which would give the answer away", () => {
    for (const q of wide) {
      for (const m of q.misconceptions) {
        expect(Number(m.wrongAnswer), `${q.prompt}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("mental math — the drill stays mental", () => {
  it("keeps tier 1 genuinely easy", () => {
    for (const q of wide.filter((q) => q.tier === 1)) {
      expect(Number(q.canonicalAnswer), q.prompt).toBeLessThanOrEqual(20);
    }
  });

  it("keeps every answer small enough to hold in your head", () => {
    for (const q of wide) {
      expect(Number(q.canonicalAnswer), q.prompt).toBeLessThan(2000);
    }
  });

  it("gets harder as the tier climbs", () => {
    const mean = (tier: number) => {
      const at = wide.filter((q) => q.tier === tier);
      return at.reduce((sum, q) => sum + Number(q.canonicalAnswer), 0) / at.length;
    };
    // Not a strict ordering per question, but the trend has to be real.
    expect(mean(5)).toBeGreaterThan(mean(1));
    expect(mean(4)).toBeGreaterThan(mean(1));
  });

  it("forces a borrow on the tier-3 subtractions", () => {
    const subs = wide.filter((q) => q.tier === 3 && q.subtopic === "subtraction");
    expect(subs.length).toBeGreaterThan(0);
    for (const q of subs) {
      const [a, b] = q.prompt.split(" − ").map(Number);
      expect(a % 10, `${q.prompt} does not actually need a borrow`).toBeLessThan(b % 10);
    }
  });

  it("keeps every division exact", () => {
    const divisions = wide.filter((q) => q.subtopic === "division");
    expect(divisions.length).toBeGreaterThan(0);
    for (const q of divisions) {
      const [a, b] = q.prompt.split(" ÷ ").map(Number);
      expect(a % b, `${q.prompt} does not divide evenly`).toBe(0);
    }
  });

  it("keeps every percentage whole", () => {
    const pcts = wide.filter((q) => q.subtopic === "percentages");
    expect(pcts.length).toBeGreaterThan(0);
    for (const q of pcts) {
      expect(Number.isInteger(Number(q.canonicalAnswer)), q.prompt).toBe(true);
    }
  });
});

/*
 * Correctness is not usefulness. Every test above passed while the squares
 * generator was emitting "30² = 900, and you are 0 above it. Add 0 then 0."
 * and division was ending on "that leaves 0 to share" — arithmetically true,
 * worthless as help, and both look like bugs to the person reading them.
 */
describe("mental math — the ladder is worth climbing", () => {
  const hintsOf = (q: { hints: string[] }) => q.hints.join(" | ");

  it("never offers a correction of zero", () => {
    for (const q of wide) {
      const text = hintsOf(q);
      expect(text, `${q.prompt}: ${text}`).not.toMatch(/\b(Add|Take off|add|take off) 0\b/);
      expect(text, `${q.prompt}: ${text}`).not.toMatch(/\bis 0 (above|below)\b/);
      expect(text, `${q.prompt}: ${text}`).not.toMatch(/\byou are 0\b/);
    }
  });

  it("never says there is nothing left to do", () => {
    for (const q of wide) {
      expect(hintsOf(q), q.prompt).not.toMatch(/leaves 0\b/);
      expect(hintsOf(q), q.prompt).not.toMatch(/That leaves 0/);
    }
  });

  it("squares always sit off a round number, or the method says nothing", () => {
    const squares = wide.filter((q) => q.subtopic === "squares");
    expect(squares.length).toBeGreaterThan(0);
    for (const q of squares) {
      const base = Number(q.prompt.replace("²", ""));
      expect(base % 10, `${q.prompt} has no correction to make`).not.toBe(0);
    }
  });

  it("never asks for ten percent, which is the first rung of its own ladder", () => {
    for (const q of wide.filter((x) => x.subtopic === "percentages")) {
      expect(q.prompt.startsWith("10%"), q.prompt).toBe(false);
    }
  });

  it("never leaves a remainder step that shares nothing", () => {
    for (const q of wide.filter((x) => x.subtopic === "division")) {
      const quotient = Number(q.canonicalAnswer);
      expect(quotient % 10, `${q.prompt} divides into a round number of lots`).not.toBe(0);
    }
  });

  it("never renders a stray negative, NaN or undefined into the copy", () => {
    for (const q of wide) {
      const text = [hintsOf(q), q.prompt, ...q.workedSolution.map((s) => s.result ?? "")].join(" ");
      expect(text, q.prompt).not.toMatch(/NaN|undefined|Infinity/);
      // A bare "+ -5" or "× -3" is a formatting failure, not real arithmetic.
      expect(text, q.prompt).not.toMatch(/[+×÷] -\d/);
    }
  });

  it("gives three distinct rungs, each of them saying something", () => {
    for (const q of wide) {
      expect(new Set(q.hints).size, `${q.prompt} repeats a rung`).toBe(3);
      for (const hint of q.hints) {
        // Low on purpose: "Ten minus 4." is a good rung. This is guarding
        // against an empty or stub string, not mandating verbosity.
        expect(hint.trim().length, `${q.prompt} has an empty rung`).toBeGreaterThan(8);
      }
    }
  });
});
