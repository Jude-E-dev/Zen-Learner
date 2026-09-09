import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import {
  costOf,
  maxOutputTokens,
  modelId,
  rateCard,
  type Usage,
} from "@/lib/tutor/config";
import { checkForLeak } from "@/lib/tutor/leak";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/tutor/prompt";
import {
  TutorRequestSchema,
  type TutorFallback,
  type TutorResponse,
} from "@/lib/tutor/request";

/**
 * The only server component in the product.
 *
 * It exists for one reason — the API key must not ship to the browser — and it
 * is built so that every failure lands on the authored hint ladder rather than
 * on an error. Pulling the key out entirely leaves the app fully playable
 * (design doc, definition of done): this route returning `ok: false` on every
 * request is a degraded tutor, not a broken app.
 *
 *   request ─► validate ─► model ─► leak check ─┬─ clean ──────► reply
 *                                               │
 *                                    leaked/suspect
 *                                               │
 *                                     retry at temperature 0
 *                                               │
 *                                   ┌───────────┴──────────┐
 *                                 clean                 leaked
 *                                   │                      │
 *                                 reply            authored hint
 */

export const runtime = "nodejs";

/** Beyond this the pause has stopped feeling like a pause. */
const REQUEST_TIMEOUT_MS = 12_000;

/**
 * The authored rung, which is what every failure path resolves to.
 *
 * Rung 3 is the last hint; the reveal is a separate phase the client owns, so
 * there is no rung to fall back to beyond the ladder's end.
 */
function authoredHint(question: { hints: string[] }, rung: number): string {
  return question.hints[Math.min(Math.max(rung, 1), question.hints.length) - 1];
}

function fallback(reason: TutorFallback["reason"], hint: string) {
  // Always 200. A fallback is a normal outcome the client renders, not an
  // error it has to catch — and a 5xx here would light up as an outage when
  // the product is behaving exactly as designed.
  return NextResponse.json<TutorResponse>({ ok: false, reason, hint });
}

/**
 * Origin check plus a shared secret.
 *
 * Neither is a real guarantee and the design doc says so: the secret ships in
 * a client bundle, so it is discoverable by anyone who looks. The actual
 * bound on worst-case loss is the provider-level spend cap. These two just
 * make casual misuse of the endpoint inconvenient.
 */
function isAllowed(req: Request): boolean {
  const secret = process.env.ZEN_TUTOR_SHARED_SECRET;
  if (secret && req.headers.get("x-zen-tutor") !== secret) return false;

  const allowed = process.env.ZEN_TUTOR_ORIGIN;
  if (!allowed) return true;
  const origin = req.headers.get("origin");
  // A same-origin fetch from the app sends no Origin header on some browsers,
  // so a missing one is not by itself evidence of anything.
  return origin === null || origin === allowed;
}

function totalUsage(...usages: Usage[]): Usage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      cacheWriteTokens: acc.cacheWriteTokens + u.cacheWriteTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
    }),
    { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
  );
}

function usageOf(message: Anthropic.Message): Usage {
  return {
    inputTokens: message.usage.input_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    outputTokens: message.usage.output_tokens,
  };
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function POST(req: Request) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "not allowed" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body did not parse" }, { status: 400 });
  }

  const parsed = TutorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "request did not validate", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const request = parsed.data;
  const hint = authoredHint(request.question, request.rung);

  // No key is a supported configuration, not a misconfiguration: the app is
  // meant to be fully playable without one.
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback("not-configured", hint);
  }

  const model = modelId();
  const card = rateCard(model);
  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

  const userMessage = buildUserMessage(request);

  /*
   * Deliberately no `thinking` and no `output_config.effort`. Haiku 4.5 takes
   * neither — effort errors outright — and there is nothing here to think
   * about: the worked solution is in the context, and a model that reasons its
   * way to the answer is a model that eventually says it out loud.
   */
  const ask = (temperature: number) =>
    client.messages.create({
      model,
      max_tokens: maxOutputTokens(card),
      temperature,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

  try {
    const first = await ask(0.6);
    const firstText = textOf(first);
    const firstLeak = checkForLeak(firstText, request.question);

    if (firstLeak.verdict === "clean") {
      return respond(firstText, false, usageOf(first));
    }

    /*
     * One retry at temperature 0, per the design doc. Same prompt: the point
     * is to take the most probable completion rather than to argue with the
     * model about what it just did, and a "you leaked the answer" turn would
     * put the answer in the conversation a second time.
     */
    const second = await ask(0);
    const secondText = textOf(second);
    const secondLeak = checkForLeak(secondText, request.question);
    const usage = totalUsage(usageOf(first), usageOf(second));

    if (secondLeak.verdict === "clean") {
      return respond(secondText, true, usage);
    }

    logDev(
      `leak on both attempts (${firstLeak.verdict}/${secondLeak.verdict}) — ` +
        `offending: ${secondLeak.offending ?? firstLeak.offending}`,
      usage,
      card,
    );
    return fallback("leak", hint);
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      logDev("provider timed out", null, card);
      return fallback("timeout", hint);
    }
    if (error instanceof Anthropic.APIError) {
      logDev(`provider error ${error.status}: ${error.message}`, null, card);
      return fallback("provider-error", hint);
    }
    logDev(`unexpected: ${(error as Error).message}`, null, card);
    return fallback("provider-error", hint);
  }

  function respond(reply: string, retried: boolean, usage: Usage) {
    const costUsd = costOf(usage, card);
    logDev(retried ? "tutored (after retry)" : "tutored", usage, card);
    return NextResponse.json<TutorResponse>({
      ok: true,
      reply,
      retried,
      // The design doc asks for the running cost to print in dev. Shipping it
      // to the client in production would mean a number nobody reads and a
      // detail about our billing on every response.
      ...(process.env.NODE_ENV === "development" ? { costUsd } : {}),
    });
  }
}

/**
 * Cost, printed where it can be seen (design doc constraint #4: "the number is
 * never a mystery"). Dev only — in production this is noise in a log nobody
 * is tailing.
 */
function logDev(
  what: string,
  usage: Usage | null,
  card: ReturnType<typeof rateCard>,
): void {
  if (process.env.NODE_ENV !== "development") return;
  if (!usage) {
    console.log(`[tutor] ${what}`);
    return;
  }
  const cost = costOf(usage, card);
  console.log(
    `[tutor] ${what} — $${cost.toFixed(5)} ` +
      `(in ${usage.inputTokens}, cache w${usage.cacheWriteTokens}/r${usage.cacheReadTokens}, ` +
      `out ${usage.outputTokens})`,
  );
}
