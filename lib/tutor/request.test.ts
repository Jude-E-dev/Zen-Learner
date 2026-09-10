import { describe, expect, it } from "vitest";

import { loadAll } from "../content/load";
import { generateMentalMath } from "../content/mental";
import { MAX_RUNG } from "./prompt";
import { TutorRequestSchema } from "./request";

/**
 * The wire contract is the only gate between an arbitrary POST and a request
 * we pay for. Everything below is a request that must never reach the
 * provider: the cost of letting one through is real money spent on a prompt
 * that could not have produced a usable hint.
 */

const question = loadAll().flatMap((f) => f.questions)[0];
const valid = { question, rung: 1, wrongAnswer: "42" };

describe("the tutor request contract", () => {
  it("refuses a rung that is not on the ladder", () => {
    // Rung 0 and rung 4 both index outside `hints`, and an undefined hint is
    // a prompt with an empty instruction in it rather than an error.
    for (const rung of [0, MAX_RUNG + 1, 1.5, -1]) {
      expect(
        TutorRequestSchema.safeParse({ ...valid, rung }).success,
        `rung ${rung}`,
      ).toBe(false);
    }
  });

  it("refuses a wrong answer long enough to be a payload rather than an answer", () => {
    expect(
      TutorRequestSchema.safeParse({ ...valid, wrongAnswer: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      TutorRequestSchema.safeParse({ ...valid, wrongAnswer: "x".repeat(500) }).success,
    ).toBe(true);
  });

  it("refuses a question missing the parts the prompt is built from", () => {
    for (const broken of [
      { ...question, hints: [question.hints[0]] },
      { ...question, canonicalAnswer: "" },
      { ...question, misconceptions: [] },
    ]) {
      expect(
        TutorRequestSchema.safeParse({ ...valid, question: broken }).success,
        JSON.stringify(Object.keys(broken)),
      ).toBe(false);
    }
  });

  it("accepts a generated question, which is the case with nothing on disk", () => {
    // Mental-math questions are built in the browser and have never existed
    // as a file, so a server-side lookup is not an option and the schema has
    // to take them as they arrive.
    const generated = generateMentalMath(7, 2)[0];
    expect(TutorRequestSchema.safeParse({ ...valid, question: generated }).success).toBe(
      true,
    );
  });
});
