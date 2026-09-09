import { describe, expect, it } from "vitest";

import { loadAll } from "../../content/load";
import { MAX_RUNG } from "../prompt";
import {
  checkAddresses,
  checkLeak,
  checkRung,
  checkShape,
  countQuestions,
  runChecks,
  splitSentences,
} from "./checks";
import { buildFixtures } from "./fixtures";

/**
 * The eval's own tests.
 *
 * A check that silently passes everything is worse than no check, because it
 * reads as evidence. Each of the four is given a reply it must fail as well as
 * one it must pass — the failing case is the load-bearing half.
 */

const pool = loadAll().flatMap((f) => f.questions);
const question = pool.find((q) => q.misconceptions.length > 0) ?? pool[0];

describe("sentence splitting", () => {
  it("does not split a decimal into two sentences", () => {
    expect(splitSentences("The slope is 0.5 there. What does that tell you?")).toHaveLength(2);
  });

  it("does not split inside f(x) or a trailing abbreviation", () => {
    expect(splitSentences("Look at f(x) again. Which rule applies?")).toHaveLength(2);
  });

  it("counts only sentences that actually end in a question mark", () => {
    expect(countQuestions("You dropped the inner term. What is the inside?")).toBe(1);
    expect(countQuestions("Two things. Then what? And then what?")).toBe(2);
    expect(countQuestions("No question here at all.")).toBe(0);
  });
});

describe("the shape check", () => {
  it("passes two sentences with exactly one question", () => {
    const reply = "You differentiated the outside only. What is the derivative of the inside?";
    expect(checkShape(reply, 1).outcome).toBe("pass");
  });

  it("fails three sentences", () => {
    const reply = "You missed a step. It happens a lot. What is the inside function?";
    expect(checkShape(reply, 1).outcome).toBe("fail");
  });

  it("fails a reply with no question", () => {
    expect(checkShape("You dropped the inner derivative entirely.", 1).outcome).toBe("fail");
  });

  it("fails two questions", () => {
    expect(checkShape("What is the inside? And its derivative?", 1).outcome).toBe("fail");
  });

  /*
   * The last rung is held to the same shape as the first two.
   *
   * It used to be exempt, on the theory that rung 3 walks the worked solution.
   * It does not — the reveal is authored and never involves the model — so a
   * four-sentence walkthrough at rung 3 is the same failure it would be at
   * rung 1.
   */
  it("holds the last rung to the same two sentences as the first", () => {
    const walk =
      "First, name the outside function. Then differentiate it. Then multiply by the inside's derivative. Finally tidy the result.";
    expect(checkShape(walk, MAX_RUNG).outcome).toBe("fail");
    expect(
      checkShape("You stopped one step early. What does the chain rule still owe you?", MAX_RUNG)
        .outcome,
    ).toBe("pass");
  });
});

describe("the leak check", () => {
  it("passes a reply that says nothing numeric", () => {
    const reply = "You stopped one step early. What does the chain rule still owe you?";
    expect(checkLeak(reply, question).outcome).toBe("pass");
  });

  it("fails a reply containing the answer", () => {
    const reply = `The answer is ${question.canonicalAnswer}. Does that make sense?`;
    expect(checkLeak(reply, question).outcome).toBe("fail");
  });

  /*
   * Stricter than production on purpose: at runtime a `suspect` verdict only
   * triggers a retry, but in an eval a fragment the validator could not read
   * is exactly what a person should look at.
   */
  it("treats a suspect fragment as a failure, unlike the runtime path", () => {
    const reply = `Consider ${question.canonicalAnswer} as a shape. What do you notice?`;
    expect(checkLeak(reply, question).outcome).toBe("fail");
  });
});

describe("the rung check", () => {
  it("passes a reply that echoes the rung it is on", () => {
    const q = pool.find((x) => x.hints[0].length > 30) ?? pool[0];
    expect(checkRung(q.hints[0], q, 1).outcome).toBe("pass");
  });

  it("warns when the reply reads like a later rung", () => {
    const q =
      pool.find((x) => {
        // Needs rungs distinct enough for overlap to mean anything.
        const a = new Set(x.hints[0].toLowerCase().split(/\W+/));
        return x.hints[2].split(/\W+/).filter((w) => w.length > 3 && !a.has(w)).length > 4;
      }) ?? pool[0];
    expect(checkRung(q.hints[2], q, 1).outcome).toBe("warn");
  });

  it("has nothing to say on the last rung", () => {
    expect(checkRung("anything at all", question, question.hints.length).outcome).toBe("pass");
  });
});

describe("the addresses check", () => {
  it("passes a reply using the misconception's own vocabulary", () => {
    const m = question.misconceptions[0];
    expect(checkAddresses(m.description, question, m.id).outcome).toBe("pass");
  });

  it("warns on a generic reply that could answer any question", () => {
    const m = question.misconceptions[0];
    expect(checkAddresses("Think about it again.", question, m.id).outcome).toBe("warn");
  });

  it("has nothing to check when no misconception was matched", () => {
    expect(checkAddresses("Think about it again.", question, undefined).outcome).toBe("pass");
  });
});

describe("the fixture set", () => {
  const fixtures = buildFixtures(pool);

  it("is the size the design doc asks for", () => {
    // "~15-20 fixtures", per design doc #12.
    expect(fixtures.length).toBeGreaterThanOrEqual(15);
    expect(fixtures.length).toBeLessThanOrEqual(25);
  });

  it("has no duplicate ids", () => {
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
  });

  it("spreads across every rung", () => {
    const rungs = new Set(fixtures.map((f) => f.rung));
    for (let r = 1; r <= MAX_RUNG; r++) expect(rungs.has(r)).toBe(true);
  });

  it("spreads across tiers rather than probing only the easy ones", () => {
    expect(new Set(fixtures.map((f) => f.question.tier)).size).toBeGreaterThanOrEqual(3);
  });

  it("includes the two cases the bank cannot produce on its own", () => {
    expect(fixtures.some((f) => f.misconceptionId === undefined)).toBe(true);
    expect(fixtures.some((f) => f.rung === MAX_RUNG)).toBe(true);
  });

  it("uses wrong answers that are genuinely wrong", () => {
    // A "wrong answer" fixture that is actually correct would test nothing.
    for (const f of fixtures) {
      if (!f.misconceptionId) continue;
      expect(f.wrongAnswer, f.id).not.toBe(f.question.canonicalAnswer);
    }
  });
});

describe("the suite as a whole", () => {
  it("fails a reply that gives the answer away, whatever else it does right", () => {
    const reply = `It is ${question.canonicalAnswer}. Does that help?`;
    const verdict = runChecks(reply, question, 1, question.misconceptions[0].id);
    expect(verdict.failed).toBe(true);
    expect(verdict.checks.find((c) => c.name === "leak")?.outcome).toBe("fail");
  });

  it("passes a well-formed reply", () => {
    const m = question.misconceptions[0];
    const reply = `${m.description.replace(/\.$/, "")}. What does that leave undone?`;
    const verdict = runChecks(reply, question, 1, m.id);
    expect(verdict.failed).toBe(false);
  });
});
