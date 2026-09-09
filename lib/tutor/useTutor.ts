"use client";

import { useCallback, useRef, useState } from "react";

import type { Question } from "../content/schema";
import type { FallbackReason, TutorResponse } from "./request";

/**
 * The client half of the pause.
 *
 * Two things matter here and neither is the happy path:
 *
 *   1. **The request is never allowed to hang.** A pause that sits on a
 *      spinner is worse than one that shows the authored hint, because the
 *      authored hint is genuinely useful and the spinner is not. The abort
 *      below is the client's own deadline, shorter than the server's, so the
 *      learner always sees an outcome.
 *
 *   2. **One request at a time, ever.** Input locks while a request is in
 *      flight (design doc, latency treatment). A double-submit would spend
 *      twice and count twice against a five-a-day quota for one question.
 *
 * Every failure resolves to `fallback`, which carries the authored rung. There
 * is no error state, because there is no error the learner can act on.
 */

/** Shorter than the server's 12s, so the client's deadline is the binding one. */
const CLIENT_TIMEOUT_MS = 14_000;

export interface TutorTurn {
  /** What the tutor said, or the authored hint when it could not. */
  text: string;
  /** True when this is the authored ladder rather than a tutored rewrite. */
  authored: boolean;
  reason?: FallbackReason;
  retried?: boolean;
  /** Dollars, dev builds only. */
  costUsd?: number;
}

export type TutorStatus = "idle" | "thinking" | "done";

export interface AskArgs {
  question: Question;
  rung: number;
  wrongAnswer: string;
  misconceptionId?: string;
  learnerReply?: string;
  /** The rung to show if anything goes wrong. Never empty. */
  authoredHint: string;
}

export function useTutor() {
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [turn, setTurn] = useState<TutorTurn | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setStatus("idle");
    setTurn(null);
  }, []);

  /**
   * Returns the turn as well as setting it, so the caller can log an event
   * from the same value the UI renders rather than reading it back out of
   * state on a later render.
   */
  const ask = useCallback(async (args: AskArgs): Promise<TutorTurn> => {
    // A second ask while one is running is a bug in the caller, but it must
    // not become a double charge. The lock is here rather than only in the UI.
    if (inFlight.current) {
      return { text: args.authoredHint, authored: true, reason: "provider-error" };
    }

    const authored = (reason: FallbackReason): TutorTurn => ({
      text: args.authoredHint,
      authored: true,
      reason,
    });

    const controller = new AbortController();
    inFlight.current = controller;
    const deadline = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    setStatus("thinking");

    let result: TutorTurn;
    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.NEXT_PUBLIC_ZEN_TUTOR_SECRET
            ? { "x-zen-tutor": process.env.NEXT_PUBLIC_ZEN_TUTOR_SECRET }
            : {}),
        },
        body: JSON.stringify({
          question: args.question,
          rung: args.rung,
          wrongAnswer: args.wrongAnswer,
          misconceptionId: args.misconceptionId,
          learnerReply: args.learnerReply,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // 400 and 403 are our own bugs or a blocked origin. Neither is
        // something the learner can do anything about, so both land on the
        // ladder like every other failure.
        result = authored("provider-error");
      } else {
        const body = (await response.json()) as TutorResponse;
        result = body.ok
          ? {
              text: body.reply,
              authored: false,
              retried: body.retried,
              costUsd: body.costUsd,
            }
          : { text: body.hint, authored: true, reason: body.reason };
      }
    } catch (error) {
      // AbortError is our own deadline firing; anything else is the network.
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      result = authored(timedOut ? "timeout" : "provider-error");
    } finally {
      clearTimeout(deadline);
      inFlight.current = null;
    }

    setTurn(result);
    setStatus("done");
    return result;
  }, []);

  /** Show the authored rung without spending a request or any quota. */
  const showAuthored = useCallback((hint: string, reason: FallbackReason) => {
    const result: TutorTurn = { text: hint, authored: true, reason };
    setTurn(result);
    setStatus("done");
    return result;
  }, []);

  return { status, turn, ask, reset, showAuthored };
}
