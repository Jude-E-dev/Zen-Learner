import { describe, expect, it } from "vitest";
import { DEFAULT_DRILL, DRILLS, drillFor } from "./drills";
import { QuestionSchema } from "./schema";

/**
 * The drill registry is the one place that knows an authored bank from a
 * generated one. Everything downstream takes `Question[]` and cannot tell the
 * difference, so a mistake here is invisible until the selector dead-ends or
 * the summary card claims a size that does not exist.
 */

describe("drillFor — resolving a drill from the URL", () => {
  it("falls back rather than failing on an id nobody offers", () => {
    // The id comes off a query string, so it is whatever a learner pasted.
    // A dead end here would be a blank session on a typo'd link.
    for (const id of ["trigonometry", "", null, undefined]) {
      expect(drillFor(id).id).toBe(DEFAULT_DRILL.id);
    }
  });

  it("resolves every drill it advertises", () => {
    for (const drill of DRILLS) {
      expect(drillFor(drill.id).id).toBe(drill.id);
    }
  });
});

describe("drill pools", () => {
  it("declares a size only when the supply is finite", () => {
    // `size: null` is what tells the UI not to promise a question count on a
    // stream that never runs out, and the selector that it can never exhaust.
    for (const drill of DRILLS) {
      const pool = drill.pool(1);
      expect(pool.length, drill.id).toBeGreaterThan(0);
      if (drill.size !== null) {
        expect(pool.length, `${drill.id} advertises ${drill.size}`).toBe(drill.size);
      }
      for (const question of pool.slice(0, 20)) {
        expect(
          QuestionSchema.safeParse(question).success,
          `${drill.id}: ${question.id} failed the schema`,
        ).toBe(true);
      }
    }
  });
});
