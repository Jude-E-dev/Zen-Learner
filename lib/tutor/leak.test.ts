import { describe, expect, it } from "vitest";
import { checkForLeak, extractFragments, normalizeWords } from "./leak";
import { loadAll } from "../content/load";
import type { Question } from "../content/schema";

/**
 * The leak validator is the only thing standing between a chatty model and
 * the answer the learner was about to work out for themselves. Its failure
 * mode is silent — a leak it does not recognise looks exactly like a clean
 * reply — so the tests lean hard on the false-negative side.
 */

const pool = loadAll().flatMap((f) => f.questions);

/** A real question with a real answer, rather than a toy. */
const chainRule = pool.find((q) => q.canonicalAnswer.includes("(3x+1)")) ?? pool[0];
const numberQ: Question = {
  ...pool[0],
  id: "test-number",
  answerType: "number",
  variables: [],
  canonicalAnswer: "37",
  prompt: "54 − 17",
};

describe("normalizeWords", () => {
  it("turns a spelled-out expression into something parseable", () => {
    expect(normalizeWords("one over x squared")).toBe("1/x^2");
  });

  it.each([
    ["three plus four", "3+4"],
    ["two times x", "2*x"],
    ["x cubed", "x^3"],
    ["ten divided by two", "10/2"],
    ["negative five", "-5"],
  ])("converts %s", (input, expected) => {
    expect(normalizeWords(input)).toBe(expected);
  });

  it("leaves ordinary prose alone rather than mangling it", () => {
    const prose = "What happens to the exponent when you differentiate?";
    expect(normalizeWords(prose)).toBe(prose);
  });
});

describe("extractFragments", () => {
  it("pulls maths out of LaTeX delimiters", () => {
    const found = extractFragments("Try $15(3x+1)^4$ and see.");
    expect(found.some((f) => f.includes("15(3x+1)^4"))).toBe(true);
  });

  it("pulls a bare typed expression", () => {
    expect(extractFragments("so it is 15(3x+1)^4 exactly").some((f) => f.includes("15(3x+1)^4"))).toBe(true);
  });

  it("expands a LaTeX fraction into something mathjs can read", () => {
    const found = extractFragments("consider $\\frac{1}{x^2}$");
    expect(found.some((f) => f.includes("(1)/(x^2)"))).toBe(true);
  });

  it("keeps a spelled-out expression whole", () => {
    const found = extractFragments("It is one over x squared.");
    expect(found).toContain("1/x^2");
  });

  it("returns nothing to worry about for a pure question", () => {
    const found = extractFragments("What is the derivative of the inside?");
    expect(found.every((f) => !/[0-9]/.test(f))).toBe(true);
  });
});

describe("checkForLeak — the answer, given away", () => {
  it("catches the answer typed plainly", () => {
    const report = checkForLeak(`The answer is ${chainRule.canonicalAnswer}.`, chainRule);
    expect(report.verdict).toBe("leaked");
  });

  it("catches the answer inside LaTeX", () => {
    const report = checkForLeak(`You should get $${chainRule.canonicalAnswer}$.`, chainRule);
    expect(report.verdict).toBe("leaked");
  });

  it("catches an equivalent form, not just the exact string", () => {
    // The point of comparing by behaviour rather than spelling.
    const report = checkForLeak("So you land on 5*3*(3x+1)^4.", chainRule);
    expect(report.verdict).toBe("leaked");
  });

  it("catches a numeric answer spelled out in words", () => {
    expect(checkForLeak("It comes to thirty seven.", numberQ).verdict).not.toBe("clean");
  });

  it("catches a numeric answer written as digits", () => {
    expect(checkForLeak("That gives 37.", numberQ).verdict).toBe("leaked");
  });
});

describe("checkForLeak — a good hint passes", () => {
  it.each([
    "What is the derivative of the inside function?",
    "You differentiated the outside but left the inside alone. What does the chain rule say comes next?",
    "Think about which rule applies when one function sits inside another.",
    "Close. Check the exponent — what happens to it when you bring it down?",
  ])("passes: %s", (hint) => {
    expect(checkForLeak(hint, chainRule).verdict).toBe("clean");
  });

  it("passes a hint that names a rung number", () => {
    // "2" is a rung index, not the answer, and must not trip the validator.
    expect(checkForLeak("Rung 2: look at the inside function.", chainRule).verdict).toBe("clean");
  });

  it("passes a hint that quotes the question back", () => {
    const report = checkForLeak(`You are differentiating ${chainRule.prompt}. What is the outer function?`, chainRule);
    expect(report.verdict).not.toBe("leaked");
  });
});

describe("checkForLeak — the suspicious middle", () => {
  it("treats an unparseable maths-looking fragment as suspect, not clean", () => {
    const report = checkForLeak("The result is 15(3x+1)^^^4 roughly.", chainRule);
    expect(report.verdict).not.toBe("clean");
  });

  /*
   * The documented residual risk, asserted rather than left implicit. A leak
   * with no extractable fragment is NOT caught here — it is handled by the
   * system prompt and by eval fixtures. If this test ever starts failing
   * because the validator got smarter, that is good news, but the prompt-level
   * prevention still has to stay.
   */
  it("does not claim to catch a leak stated purely in prose", () => {
    const prose = "Multiply the whole thing by the derivative of the inside, which is the coefficient in front.";
    expect(checkForLeak(prose, chainRule).verdict).toBe("clean");
  });
});

/**
 * The false-positive cases, measured rather than imagined.
 *
 * Every reply below is real output from the eval run on 2026-09-09, and every
 * one of them was flagged `suspect` by the "unparseable therefore suspicious"
 * rule — roughly two in five of a clean run. At runtime each would have cost a
 * retry and then a fallback to the authored hint, which is the safety net
 * switching the tutor off rather than guarding it.
 */
describe("suspicion is aimed, not sprayed", () => {
  const q = (id: string) => pool.find((x) => x.id === id)!;

  it("does not flag Leibniz notation as a possible answer", () => {
    const reply =
      "When you differentiate $xy$ you need the product rule. Which terms contain $\\frac{dy}{dx}$?";
    expect(checkForLeak(reply, q("implicit-diff-mixed")).verdict).toBe("clean");
  });

  it("does not flag a non-numeric fragment when the answer is a number", () => {
    // Answer is 2; "-cos(x)" cannot be a disguised 2.
    const reply = "The antiderivative of $\\sin(x)$ is $-\\cos(x)$. Now apply the bounds.";
    expect(checkForLeak(reply, q("definite-sin-zero-pi")).verdict).toBe("clean");
  });

  it("does not flag an indeterminate form", () => {
    const reply =
      "Direct substitution gives $\\frac{0}{0}$, an indeterminate form. Did you check the result again?";
    expect(checkForLeak(reply, q("limit-series-order")).verdict).toBe("clean");
  });

  it("does not flag a malformed exponent fragment", () => {
    const reply = "That is the indeterminate form $1^{\\infty}$, not one to any power. What now?";
    expect(checkForLeak(reply, q("limit-definition-of-e")).verdict).toBe("clean");
  });

  /*
   * The other half of the split. Detection must not have been traded away:
   * `dy/dx = <answer>` now yields the answer as its own fragment, where before
   * the whole statement was one unparseable blob that only ever reached
   * "suspect".
   */
  it("still catches an answer stated after an equals sign", () => {
    const target = pool.find((x) => x.answerType === "expression")!;
    const reply = `So $\\frac{dy}{dx} = ${target.canonicalAnswer}$ is where that lands.`;
    expect(checkForLeak(reply, target).verdict).toBe("leaked");
  });

  it("does not flag a fragment quoted from the question prompt", () => {
    // x^2 - 4 is printed in the question. Restating it reveals nothing.
    const reply = "You stopped at division by zero. What do you get when you factor $x^2 - 4$?";
    expect(checkForLeak(reply, q("limit-factorable")).verdict).toBe("clean");
  });

  it("keeps function names when unwrapping LaTeX", () => {
    /*
     * The catch-all strip turned \cos into a space, so cos(y) became a bare
     * (y) — a different expression, unresolvable, and reported as suspicious.
     */
    expect(extractFragments("that is $\\cos(y)$").join(" ")).toContain("cos");
  });

  it("does not flag Leibniz notation embedded in a larger fragment", () => {
    const reply =
      "Gather the terms: $\\cos(y) \\cdot \\frac{dy}{dx} + 2x$ on the left. What next?";
    expect(checkForLeak(reply, q("implicit-diff-trig")).verdict).toBe("clean");
  });

  /*
   * The guard is derived from the answer, not asserted about the bank: an
   * answer that itself uses the notation must still be a candidate.
   *
   * The question is contrived rather than borrowed, because every real
   * implicit-differentiation prompt asks for dy/dx in so many words — which
   * makes the fragment quoted problem text, and clean for a different and
   * also correct reason. Reusing one would have tested the wrong rule.
   */
  it("still flags Leibniz notation when the answer actually contains it", () => {
    const contrived = {
      ...q("implicit-diff-trig"),
      prompt: "Find the rate of change.",
      canonicalAnswer: "dy/dx",
    };
    expect(checkForLeak("so $\\frac{dy}{dx}$ is it", contrived).verdict).not.toBe(
      "clean",
    );
  });

  /*
   * The detection floor, measured across the whole bank rather than asserted.
   *
   * Two holes showed up here on 2026-09-09, both of which let a plainly stated
   * answer through: the scanner required a digit (so `-x/y`, `ln(ln(x))` and
   * `-tan(x)` were never candidates), and it tokenised on characters that
   * exclude spaces (so `x*e^x - e^x` was only ever seen in halves).
   */
  it("catches every answer in the bank, however it is phrased", () => {
    const misses: string[] = [];
    for (const target of pool) {
      const phrasings = [
        `The answer is $${target.canonicalAnswer}$.`,
        `So you get ${target.canonicalAnswer}.`,
        `That works out to $\\frac{d}{dx} = ${target.canonicalAnswer}$.`,
        `${target.canonicalAnswer}`,
      ];
      for (const [i, phrasing] of phrasings.entries()) {
        if (checkForLeak(phrasing, target).verdict === "clean") {
          misses.push(`${target.id} form${i}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it("catches a multi-term answer stated with spaces", () => {
    const target = pool.find((x) => /\s[-+]\s/.test(x.canonicalAnswer))!;
    expect(checkForLeak(`So you get ${target.canonicalAnswer}.`, target).verdict).toBe(
      "leaked",
    );
  });

  it("catches a digit-free answer", () => {
    const target = pool.find((x) => !/[0-9]/.test(x.canonicalAnswer))!;
    expect(checkForLeak(`So you get ${target.canonicalAnswer}.`, target).verdict).toBe(
      "leaked",
    );
  });

  it("still catches a bare answer", () => {
    const target = pool.find((x) => x.answerType === "number")!;
    expect(
      checkForLeak(`It comes to ${target.canonicalAnswer}.`, target).verdict,
    ).toBe("leaked");
  });
});
