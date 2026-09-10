import { describe, expect, it } from "vitest";

import { loadAll } from "../content/load";
import { buildUserMessage, MAX_RUNG, SYSTEM_PROMPT } from "./prompt";

/**
 * What goes into the payload is the whole safety story, because the model is
 * forbidden from working anything out for itself. A slot filled with the
 * wrong thing — or left empty — is how a constrained tutor becomes an
 * unconstrained one.
 */

const question = loadAll()
  .flatMap((f) => f.questions)
  .find((q) => q.misconceptions.length > 0)!;
const misconception = question.misconceptions[0];

const base = { question, rung: 1, wrongAnswer: misconception.wrongAnswer };

describe("buildUserMessage", () => {
  it("never sends the worked solution", () => {
    /*
     * The 2026-09-09 eval produced two outright leaks, both of them a rung-3
     * walkthrough narrating its way to the final step. The route to the
     * answer is not sent; only the answer, so the model knows what to avoid.
     */
    const message = buildUserMessage({ ...base, rung: MAX_RUNG });
    for (const step of question.workedSolution) {
      expect(message, `worked step leaked: ${step.step}`).not.toContain(step.step);
    }
    expect(message).toContain(question.canonicalAnswer);
  });

  it("says the mistake is unknown rather than leaving the slot empty", () => {
    // An empty slot is what makes a model invent a diagnosis to fill it.
    const message = buildUserMessage({ ...base, misconceptionId: "no-such-slip" });
    expect(message).toContain("WE COULD NOT IDENTIFY THE MISTAKE");
    expect(message).not.toContain(misconception.description);
  });

  it("carries only the rung it is on, never a later one", () => {
    const message = buildUserMessage({ ...base, rung: 1 });
    expect(message).toContain(question.hints[0]);
    for (const later of question.hints.slice(1)) {
      expect(message, `rung ahead of itself: ${later}`).not.toContain(later);
    }
  });
});

describe("the system prompt", () => {
  it("states the rung ceiling the request schema enforces", () => {
    // The two drift apart silently: the schema would keep accepting rung 3
    // while the prompt described a four-rung ladder that does not exist.
    expect(SYSTEM_PROMPT).toContain(`Rung ${MAX_RUNG} is the last hint`);
  });
});
