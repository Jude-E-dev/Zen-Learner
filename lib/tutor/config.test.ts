import { describe, expect, it } from "vitest";

import {
  ASSUMED_MIX,
  COST_CEILING_PER_PAUSE,
  DAILY_PAUSE_QUOTA,
  DEFAULT_MODEL,
  RATE_CARDS,
  cachingApplies,
  costOf,
  maxOutputTokens,
  projectedCost,
  rateCard,
} from "./config";
import { MAX_RUNG, SYSTEM_PROMPT } from "./prompt";

/**
 * The budget, enforced.
 *
 * The point of this file is that a model swap or a prompt that grows fails
 * here rather than on an invoice. Every assertion is about the ceiling in
 * design doc constraint #4, not about the arithmetic of multiplication.
 */

describe("rate cards", () => {
  it("prices the default model", () => {
    expect(RATE_CARDS[DEFAULT_MODEL]).toBeDefined();
  });

  it("refuses to budget a model it has no card for", () => {
    expect(() => rateCard("claude-imaginary-9")).toThrow(/No rate card/);
  });

  it("keeps the four rates distinct, so none can hide behind another", () => {
    for (const [model, card] of Object.entries(RATE_CARDS)) {
      expect(card.cacheWrite, model).toBeGreaterThan(card.input);
      expect(card.cacheRead, model).toBeLessThan(card.input);
      expect(card.output, model).toBeGreaterThan(card.input);
    }
  });

  it("prices the four rates separately rather than blending them", () => {
    const card = rateCard("claude-haiku-4-5");
    const readOnly = costOf(
      { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 1_000_000, outputTokens: 0 },
      card,
    );
    const writeOnly = costOf(
      { inputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 },
      card,
    );
    expect(readOnly).toBeCloseTo(0.1, 6);
    expect(writeOnly).toBeCloseTo(1.25, 6);
  });

  it("costs nothing for an empty exchange", () => {
    expect(
      costOf({ inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 }),
    ).toBe(0);
  });
});

describe("the cost ceiling", () => {
  /*
   * Every card, not just the default one. ZEN_TUTOR_MODEL can point the tutor
   * at any of them, so a card that busts the ceiling is a bug even if nothing
   * currently selects it.
   */
  for (const [model, card] of Object.entries(RATE_CARDS)) {
    it(`${model} stays under the ceiling on every request`, () => {
      const { cold, warm } = projectedCost(card);
      expect(cold).toBeLessThan(COST_CEILING_PER_PAUSE);
      expect(warm).toBeLessThan(COST_CEILING_PER_PAUSE);
    });

    /*
     * The ceiling is per *pause*, and a pause is up to MAX_RUNG requests —
     * one per rung of the ladder. Pricing a single request against it would
     * understate the worst case by a factor of three.
     */
    it(`${model} stays under the ceiling for a full ${MAX_RUNG}-rung pause`, () => {
      const worstPause = projectedCost(card).cold * MAX_RUNG;
      expect(worstPause).toBeLessThan(COST_CEILING_PER_PAUSE);
    });

    it(`${model} stays under the ceiling even at the output cap`, () => {
      const worst = costOf(
        {
          inputTokens: ASSUMED_MIX.stableInputTokens + ASSUMED_MIX.freshInputTokens,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          outputTokens: maxOutputTokens(card),
        },
        card,
      );
      expect(worst).toBeLessThanOrEqual(COST_CEILING_PER_PAUSE);
    });
  }

  it("caps output at something a two-sentence reply cannot exceed", () => {
    // A licence to ramble is not a safety net. 600 is the clamp in config.ts.
    expect(maxOutputTokens()).toBeLessThanOrEqual(600);
    expect(maxOutputTokens()).toBeGreaterThanOrEqual(ASSUMED_MIX.outputTokens);
  });

  it("leaves a whole order of magnitude of headroom on the default model", () => {
    // Not a tight fit that a slightly longer prompt would break.
    expect(projectedCost().cold).toBeLessThan(COST_CEILING_PER_PAUSE / 10);
  });
});

describe("prompt caching", () => {
  /*
   * The trap this guards: `cache_control` on a prefix below the model's floor
   * is accepted silently and does nothing. Without this test the config could
   * claim a saving that the invoice never shows.
   */
  /*
   * Not one of the priced models can cache a prefix this short — the floors
   * are 512, 1024 and 4096 against a ~369-token prompt. The budget must not
   * claim a saving none of them will deliver.
   */
  it("claims no caching on any model, because none can cache a prefix this short", () => {
    for (const [model, card] of Object.entries(RATE_CARDS)) {
      expect(ASSUMED_MIX.stableInputTokens, model).toBeLessThan(
        card.minCacheablePrefixTokens,
      );
      expect(cachingApplies(card), model).toBe(false);

      const { cold, warm, cached } = projectedCost(card);
      expect(cached, model).toBe(false);
      expect(cold, model).toBe(warm);
    }
  });

  /*
   * The projection is not hardcoded to "never caches" — it models a cache
   * whenever the prefix clears the floor. A hypothetical card proves the
   * branch works, so a prompt that grows past a real floor starts being
   * priced correctly without anyone remembering to look.
   */
  it("models the cache once the prefix clears a floor", () => {
    const lowFloor = { ...rateCard(DEFAULT_MODEL), minCacheablePrefixTokens: 128 };
    expect(cachingApplies(lowFloor)).toBe(true);
    const { cold, warm, cached } = projectedCost(lowFloor);
    expect(cached).toBe(true);
    expect(warm).toBeLessThan(cold);
  });

  /*
   * ASSUMED_MIX.stableInputTokens is a guess at the system prompt's size, and a
   * guess that drifts far enough stops being a budget. Roughly four characters
   * per token is close enough to catch a prompt that doubles.
   */
  it("assumes a stable-prefix size the system prompt actually resembles", () => {
    const estimated = SYSTEM_PROMPT.length / 4;
    expect(estimated).toBeGreaterThan(ASSUMED_MIX.stableInputTokens * 0.4);
    expect(estimated).toBeLessThan(ASSUMED_MIX.stableInputTokens * 2);
  });
});

describe("the daily quota", () => {
  it("defaults to five, per the design doc", () => {
    expect(DAILY_PAUSE_QUOTA).toBe(5);
  });

  /*
   * The quota is a spend bound, so state what it bounds. A learner who burns
   * every pause they have costs less for the whole day than the ceiling
   * permits for one pause — which is the margin that makes the quota a
   * safeguard against runaway loops rather than the thing holding the budget
   * together.
   */
  it("costs less for a whole day than the ceiling allows for two pauses", () => {
    const fullDay = projectedCost().warm * MAX_RUNG * DAILY_PAUSE_QUOTA;
    expect(fullDay).toBeLessThan(COST_CEILING_PER_PAUSE * 2);
  });
});
