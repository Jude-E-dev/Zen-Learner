import { describe, expect, it } from "vitest";
import { checkAnswer } from "./check";
import { normalize } from "./normalize";
import { loadAll } from "../content/load";
import { generateMentalMath } from "../content/mental";
import type { Question } from "../content/schema";

const questions = new Map<string, Question>();
for (const file of loadAll()) {
  for (const q of file.questions) questions.set(q.id, q);
}

function q(id: string): Question {
  const found = questions.get(id);
  if (!found) throw new Error(`test fixture missing question: ${id}`);
  return found;
}

describe("normalize", () => {
  it("expands nested LaTeX fractions", () => {
    expect(normalize("\\frac{1}{2}")).toBe("((1)/(2))");
    expect(normalize("\\frac{\\frac{1}{2}}{3}")).toBe("((((1)/(2)))/(3))");
  });

  it("strips presentation-only markup", () => {
    expect(normalize("\\left(3x+1\\right)^{4}")).toBe("(3x+1)^(4)");
    expect(normalize("$2x \\cdot \\cos(x)$")).toBe("2x * cos(x)");
  });

  it("drops a trailing constant of integration", () => {
    expect(normalize("sin(x^2) + C")).toBe("sin(x^2)");
  });

  it("maps ln to natural log and normalizes unicode", () => {
    expect(normalize("\\ln(x)")).toBe("log(x)");
    expect(normalize("2 − 1")).toBe("2 - 1");
  });
});

describe("checkAnswer — accepts equivalent forms it was never told about", () => {
  it("accepts the canonical answer itself", () => {
    expect(checkAnswer("15(3x+1)^4", q("chain-rule-power")).verdict).toBe("correct");
  });

  it("accepts LaTeX spelling of the same answer", () => {
    expect(
      checkAnswer("15\\left(3x+1\\right)^{4}", q("chain-rule-power")).verdict,
    ).toBe("correct");
  });

  it("accepts a fully expanded polynomial nobody enumerated", () => {
    expect(
      checkAnswer(
        "1215x^4 + 1620x^3 + 810x^2 + 180x + 15",
        q("chain-rule-power"),
      ).verdict,
    ).toBe("correct");
  });

  it("accepts a trig identity rewrite", () => {
    // -sin(x)/cos(x) and -tan(x) are the same function. Symbolic simplification
    // routinely misses this; sampling does not.
    expect(checkAnswer("-sin(x)/cos(x)", q("chain-log-cos")).verdict).toBe("correct");
  });

  it("accepts a factored rearrangement", () => {
    expect(checkAnswer("(x - 1)*e^x", q("parts-x-exp-x")).verdict).toBe("correct");
  });
});

describe("checkAnswer — antiderivatives differ by a constant", () => {
  // This is the case that a naive pointwise comparison gets wrong every single
  // time, on a whole topic of the content.
  it("accepts the answer with + C written out", () => {
    expect(checkAnswer("sin(x^2) + C", q("u-sub-2x-cos-x2")).verdict).toBe("correct");
  });

  it("accepts the answer with an arbitrary numeric constant", () => {
    expect(checkAnswer("sin(x^2) + 7", q("u-sub-2x-cos-x2")).verdict).toBe("correct");
  });

  it("accepts a different constant again", () => {
    expect(checkAnswer("sin(x^2) - 41.5", q("u-sub-2x-cos-x2")).verdict).toBe("correct");
  });

  it("still rejects an antiderivative that is genuinely wrong", () => {
    expect(checkAnswer("cos(x^2)", q("u-sub-2x-cos-x2")).verdict).toBe("incorrect");
  });

  it("accepts a constant shift on an integration-by-parts answer", () => {
    expect(checkAnswer("x*e^x - e^x + 3", q("parts-x-exp-x")).verdict).toBe("correct");
  });
});

describe("checkAnswer — multivariable answers", () => {
  it("accepts an implicit differentiation answer in x and y", () => {
    expect(checkAnswer("-x/y", q("implicit-diff-circle")).verdict).toBe("correct");
    expect(checkAnswer("-(x/y)", q("implicit-diff-circle")).verdict).toBe("correct");
  });

  it("does not confuse -x/y with a sign flip", () => {
    const result = checkAnswer("x/y", q("implicit-diff-circle"));
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBe("sign-error");
  });
});

describe("checkAnswer — numeric answers", () => {
  it("accepts equivalent numeric spellings", () => {
    expect(checkAnswer("1", q("definite-3x2-zero-one")).verdict).toBe("correct");
    expect(checkAnswer("1.0", q("definite-3x2-zero-one")).verdict).toBe("correct");
    expect(checkAnswer("3/3", q("definite-3x2-zero-one")).verdict).toBe("correct");
  });

  it("identifies the forgot-to-divide mistake", () => {
    const result = checkAnswer("3", q("definite-3x2-zero-one"));
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBe("forgot-to-divide");
  });

  it("identifies an un-evaluated antiderivative as its own mistake", () => {
    const result = checkAnswer("x^3", q("definite-3x2-zero-one"));
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBe("bounds-not-applied");
  });

  it("matches a non-numeric distractor by text", () => {
    const result = checkAnswer("DNE", q("limit-sin-x-over-x"));
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBe("called-it-undefined");
  });
});

describe("checkAnswer — misconception targeting", () => {
  it("names the specific mistake behind a wrong answer", () => {
    const result = checkAnswer("5(3x+1)^4", q("chain-rule-power"));
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBe("forgot-inner-derivative");
  });

  it("matches a misconception written in a different but equivalent form", () => {
    // 5*(3x+1)^4 expanded — same mistake, different spelling.
    const result = checkAnswer(
      "405x^4 + 540x^3 + 270x^2 + 60x + 5",
      q("chain-rule-power"),
    );
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBe("forgot-inner-derivative");
  });

  it("reports incorrect without a misconception when the mistake is unanticipated", () => {
    const result = checkAnswer("42x", q("chain-rule-power"));
    expect(result.verdict).toBe("incorrect");
    expect(result.misconceptionId).toBeUndefined();
  });
});

describe("checkAnswer — unreadable input is never scored as wrong", () => {
  it("treats an empty submission as unreadable", () => {
    expect(checkAnswer("", q("chain-rule-power")).verdict).toBe("unreadable");
    expect(checkAnswer("   ", q("chain-rule-power")).verdict).toBe("unreadable");
  });

  it("treats unbalanced syntax as unreadable", () => {
    expect(checkAnswer("((", q("chain-rule-power")).verdict).toBe("unreadable");
    expect(checkAnswer("15(3x+1)^", q("chain-rule-power")).verdict).toBe("unreadable");
  });

  it("treats prose as unreadable rather than incorrect", () => {
    expect(checkAnswer("i don't know", q("chain-rule-power")).verdict).toBe("unreadable");
  });

  it("treats an answer full of unknown symbols as unreadable", () => {
    expect(checkAnswer("banana", q("chain-rule-power")).verdict).toBe("unreadable");
  });
});

/**
 * The mental-math fix from commit 14979b1: the sum itself is not an answer.
 * `requireEvaluated` questions must reject a restated calculation even though
 * it is numerically identical to the canonical answer, and still grade a
 * genuinely evaluated number normally.
 */
describe("checkAnswer — requireEvaluated rejects the sum, not just the wrong answer", () => {
  const mm = generateMentalMath(2026, 5);
  const addition = mm.find((q) => q.subtopic === "addition")!;
  const multiplication = mm.find((q) => q.subtopic === "multiplication")!;

  it("flags a restated sum as needing evaluation rather than scoring it", () => {
    // The prompt is the unevaluated expression itself — e.g. "6 + 5" — which
    // parses fine and would agree numerically with the canonical answer.
    const result = checkAnswer(normalize(addition.prompt), addition);
    expect(result.verdict).toBe("unreadable");
    expect(result.needsEvaluation).toBe(true);
  });

  it("does the same for a restated multiplication, not just addition", () => {
    const result = checkAnswer(normalize(multiplication.prompt), multiplication);
    expect(result.verdict).toBe("unreadable");
    expect(result.needsEvaluation).toBe(true);
  });

  it("grades a genuinely evaluated number normally", () => {
    const result = checkAnswer(addition.canonicalAnswer, addition);
    expect(result.verdict).toBe("correct");
    expect(result.needsEvaluation).toBeUndefined();
  });

  it("still catches a genuinely wrong evaluated number as incorrect", () => {
    const wrong = String(Number(addition.canonicalAnswer) + 100);
    const result = checkAnswer(wrong, addition);
    expect(result.verdict).toBe("incorrect");
    expect(result.needsEvaluation).toBeUndefined();
  });

  it("does not require evaluation on ordinary calculus questions", () => {
    // requireEvaluated defaults to false for the authored bank — restating
    // work is fine there, since the checker grades by behaviour.
    const calc = q("chain-rule-power");
    expect(calc.requireEvaluated).toBe(false);
  });
});

describe("content invariants — the trust guarantees", () => {
  const all = [...questions.values()];

  it("marks every authored answer key correct", () => {
    for (const question of all) {
      const result = checkAnswer(question.canonicalAnswer, question);
      expect(
        result.verdict,
        `${question.id}: answer key graded ${result.verdict} (${result.reason})`,
      ).toBe("correct");
    }
  });

  it("marks every accepted alternate form correct", () => {
    for (const question of all) {
      for (const form of question.acceptedForms) {
        const result = checkAnswer(form, question);
        expect(
          result.verdict,
          `${question.id}: acceptedForm "${form}" graded ${result.verdict}`,
        ).toBe("correct");
      }
    }
  });

  it("never marks a misconception distractor correct", () => {
    for (const question of all) {
      for (const m of question.misconceptions) {
        const result = checkAnswer(m.wrongAnswer, question);
        expect(
          result.verdict,
          `${question.id}: distractor "${m.wrongAnswer}" (${m.id}) graded correct`,
        ).not.toBe("correct");
      }
    }
  });

  it("attributes every distractor to its own misconception", () => {
    for (const question of all) {
      for (const m of question.misconceptions) {
        const result = checkAnswer(m.wrongAnswer, question);
        expect(
          result.misconceptionId,
          `${question.id}: distractor "${m.wrongAnswer}" did not resolve to ${m.id}`,
        ).toBe(m.id);
      }
    }
  });
});
