import { z } from "zod";

import { QuestionSchema } from "../content/schema";
import { MAX_RUNG } from "./prompt";

/**
 * The wire contract between the pause UI and `/api/tutor`.
 *
 * The client sends the whole question, answer key included, rather than an id
 * the server looks up. Two reasons, and neither is laziness:
 *
 *   1. Mental-math questions are generated in the browser from a seed and have
 *      never existed on disk, so there is nothing for the server to look up.
 *   2. Sending the key back reveals nothing. `generated.json` is imported into
 *      the client bundle — every answer is already on the learner's machine,
 *      and always was. The leak that matters is the tutor stating the answer
 *      in the pause, which is what lib/tutor/leak.ts is for.
 *
 * It is still validated on arrival: a malformed question would otherwise reach
 * the prompt builder and produce a request we pay for and cannot use.
 */

export const TutorRequestSchema = z.object({
  question: QuestionSchema,
  rung: z.number().int().min(1).max(MAX_RUNG),
  wrongAnswer: z.string().max(500),
  misconceptionId: z.string().max(100).optional(),
  learnerReply: z.string().max(1000).optional(),
});

export type TutorRequestBody = z.infer<typeof TutorRequestSchema>;

/** Why the authored hint is being shown instead of a tutored one. */
export type FallbackReason =
  | "leak"
  | "provider-error"
  | "timeout"
  | "not-configured"
  | "quota";

export interface TutorSuccess {
  ok: true;
  reply: string;
  /** Whether the first attempt was rejected and the retry stood in. */
  retried: boolean;
  /** Dollars for this pause, both attempts included. Dev builds only. */
  costUsd?: number;
}

export interface TutorFallback {
  ok: false;
  reason: FallbackReason;
  /** The authored rung to show instead. Never empty. */
  hint: string;
}

export type TutorResponse = TutorSuccess | TutorFallback;
