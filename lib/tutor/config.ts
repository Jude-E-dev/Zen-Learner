/**
 * What the tutor costs, and what it is allowed to cost.
 *
 * The design doc sets a hard ceiling of US$0.03 per pause and is explicit that
 * the four rates must not be collapsed into one number up front: standard
 * input, cache write, cache read and output are all different, and a blended
 * figure hides which one is actually driving the bill.
 *
 * Rates are per million tokens, taken from the published card for the model
 * named below. They are checked by config.test.ts against the ceiling, so a
 * model swap that breaks the budget fails the suite rather than the invoice.
 */

export interface RateCard {
  /** Uncached input. */
  input: number;
  /** Writing the cached prefix. Costs more than reading it, once. */
  cacheWrite: number;
  /** Reading the cached prefix on every subsequent pause. */
  cacheRead: number;
  output: number;
  /**
   * The shortest prefix this model will actually cache, in tokens.
   *
   * Below it, a `cache_control` marker is accepted and silently does nothing —
   * no error, `cache_creation_input_tokens: 0`, and a bill that quietly looks
   * like the uncached one. It is not monotonic across generations, which is
   * exactly why it has to be a field rather than a constant: Haiku 4.5 needs
   * 4096 tokens, while the far larger Opus 5 caches from 512.
   */
  minCacheablePrefixTokens: number;
}

/** Per million tokens, US dollars. */
export const RATE_CARDS: Record<string, RateCard> = {
  // Haiku 4.5: $1.00 in / $5.00 out. Cache write is 1.25x input, cache read
  // 0.1x input, which is the standard multiplier pair.
  "claude-haiku-4-5": {
    input: 1.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
    output: 5.0,
    minCacheablePrefixTokens: 4096,
  },
  "claude-sonnet-5": {
    input: 2.0,
    cacheWrite: 2.5,
    cacheRead: 0.2,
    output: 10.0,
    minCacheablePrefixTokens: 1024,
  },
};

/*
 * Opus 5 ($5 / $25 per MTok) is deliberately absent.
 *
 * It is the obvious model to reach for and it does not fit: a pause is up to
 * MAX_RUNG requests, and at the assumed mix that comes to about $0.039 against
 * a $0.03 ceiling. Adding the card back would make the tutor selectable at a
 * price the design doc forbids, and config.test.ts fails the moment it is —
 * which is the point of pricing every card rather than only the default.
 *
 * The tutor also has nothing to spend that capability on. It rephrases an
 * authored hint and is forbidden from reasoning about the problem; the ceiling
 * is not what is stopping this from being a better tutor.
 */

/**
 * Haiku by default, and the reason is architectural rather than thrift.
 *
 * The tutor is a constrained rewrite of an authored hint and is explicitly
 * forbidden from reasoning about the problem. A model that thinks by default
 * is pointed at the wrong task here — there is nothing for it to work out,
 * and the worked solution it must not reveal is sitting in its own context.
 *
 * Both cards above fit the ceiling, so this is not a corner being cut — see
 * the note there about the one that does not.
 */
export const DEFAULT_MODEL = "claude-haiku-4-5";

export function modelId(): string {
  return process.env.ZEN_TUTOR_MODEL?.trim() || DEFAULT_MODEL;
}

export function rateCard(model = modelId()): RateCard {
  const card = RATE_CARDS[model];
  if (!card) {
    throw new Error(
      `No rate card for "${model}". Add one to lib/tutor/config.ts before ` +
        `pointing the tutor at it — an unpriced model cannot be budgeted.`,
    );
  }
  return card;
}

/** Hard ceiling per pause, in US dollars (design doc constraint #4). */
export const COST_CEILING_PER_PAUSE = 0.03;

/** Pauses per learner per day. Day boundary is the device's local midnight. */
export const DAILY_PAUSE_QUOTA = 5;

/**
 * The assumed shape of one pause, stated rather than implied.
 *
 * A pause is one system prompt, a small per-question payload, and a
 * two-sentence reply. These numbers are deliberately generous — the budget
 * should survive a pause that runs long, not just an average one.
 *
 * `stableInputTokens` is the system prompt: byte-identical across every pause,
 * and therefore the only part that is a candidate for caching. The worked
 * solution and hint ladder are NOT in it, despite the design doc listing them
 * as cacheable — they change with every question, so putting them in the
 * cached prefix would invalidate it on each pause and pay the write premium
 * every single time. They live in the per-question payload instead.
 */
export const ASSUMED_MIX = {
  /** The system prompt — measured at ~369 tokens, rounded up. */
  stableInputTokens: 400,
  /** Question, answer key, ladder, worked solution, wrong answer. Varies. */
  freshInputTokens: 1100,
  /** Two sentences, one question. */
  outputTokens: 220,
} as const;

/**
 * Whether the stable prefix is long enough for this model to cache it.
 *
 * It is not — on any model currently priced above, including Opus 5 with the
 * lowest floor of the family. The system prompt measures around 369 tokens
 * against floors of 512 (Opus 5), 1024 (Sonnet 5) and 4096 (Haiku 4.5). The
 * design doc's "cache the system prompt" is therefore a no-op here, and this
 * is the honest accounting of that rather than a problem to fix: padding a
 * 369-token prompt to 4096 to make it cacheable means paying for ~3,700
 * tokens of filler on every pause to save nine tenths of the cost of 369.
 * Strictly worse, and the budget lands an order of magnitude under the
 * ceiling without it.
 *
 * The function exists so the question is re-answered rather than re-assumed.
 * If the prompt grows past a floor, or a model ships with a lower one, the
 * projection below starts modelling the cache with no further edit.
 */
export function cachingApplies(card = rateCard()): boolean {
  return ASSUMED_MIX.stableInputTokens >= card.minCacheablePrefixTokens;
}

export interface Usage {
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

/** Dollars for one exchange, from the four rates that actually applied. */
export function costOf(usage: Usage, card = rateCard()): number {
  return (
    (usage.inputTokens * card.input +
      usage.cacheWriteTokens * card.cacheWrite +
      usage.cacheReadTokens * card.cacheRead +
      usage.outputTokens * card.output) /
    1_000_000
  );
}

/**
 * What the assumed mix costs on the first pause of a session and on every
 * pause after it.
 *
 * When the model cannot cache a prefix this short, the two are identical —
 * which is the point of returning both rather than one blended number. A
 * `cold` and `warm` that match is the signal that caching is doing nothing,
 * and `cachingApplies` says whether that is expected.
 */
export function projectedCost(card = rateCard()) {
  if (!cachingApplies(card)) {
    const flat = costOf(
      {
        inputTokens: ASSUMED_MIX.stableInputTokens + ASSUMED_MIX.freshInputTokens,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        outputTokens: ASSUMED_MIX.outputTokens,
      },
      card,
    );
    return { cold: flat, warm: flat, cached: false as const };
  }

  const cold = costOf(
    {
      inputTokens: ASSUMED_MIX.freshInputTokens,
      cacheWriteTokens: ASSUMED_MIX.stableInputTokens,
      cacheReadTokens: 0,
      outputTokens: ASSUMED_MIX.outputTokens,
    },
    card,
  );
  const warm = costOf(
    {
      inputTokens: ASSUMED_MIX.freshInputTokens,
      cacheWriteTokens: 0,
      cacheReadTokens: ASSUMED_MIX.stableInputTokens,
      outputTokens: ASSUMED_MIX.outputTokens,
    },
    card,
  );
  return { cold, warm, cached: true as const };
}

/**
 * The output cap that keeps a single pause under the ceiling even if
 * everything else goes long.
 *
 * Derived rather than picked: whatever headroom the ceiling leaves after the
 * assumed input, converted to tokens at the output rate. It is then clamped to
 * something a two-sentence reply could never exceed, because a cap of 12,000
 * tokens is not a safety net — it is a licence to ramble.
 */
export function maxOutputTokens(card = rateCard()): number {
  const inputCost = projectedCost(card).cold - costOf(
    {
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: ASSUMED_MIX.outputTokens,
    },
    card,
  );
  const headroom = COST_CEILING_PER_PAUSE - inputCost;
  const affordable = Math.floor((headroom / card.output) * 1_000_000);
  return Math.max(64, Math.min(600, affordable));
}
