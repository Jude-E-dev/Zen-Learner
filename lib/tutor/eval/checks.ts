import type { Question } from "../../content/schema";
import { checkForLeak } from "../leak";
import { MAX_RUNG } from "../prompt";

/**
 * The four checks, as described in design doc #12.
 *
 * Without these, every prompt change is a guess and the fallback rate — the
 * headline quality metric — can only be tuned by feel.
 *
 * Two of the four are mechanical and two are heuristics, and it matters which
 * is which:
 *
 *   leak      mechanical. Reuses the runtime validator, so the eval and
 *             production agree by construction rather than by coincidence.
 *   shape     mechanical. Sentence and question counting.
 *   rung      heuristic. "Did it skip ahead" is really "does this read more
 *             like a later rung than this one", which is a judgement call
 *             approximated by distinctive-word overlap.
 *   addresses heuristic, and the weakest of the four. Whether a reply speaks
 *             to a named misconception is a semantic question; overlap with
 *             the misconception's own vocabulary is a proxy that catches a
 *             generic reply and misses a subtle one.
 *
 * The heuristics are tuned to flag rather than to judge. A `warn` is a thing
 * for a person to read, not a build failure, because a false positive that
 * blocks a prompt improvement is worse than a soft signal that gets skimmed.
 */

export type CheckOutcome = "pass" | "warn" | "fail";

export interface CheckResult {
  name: "leak" | "shape" | "rung" | "addresses";
  outcome: CheckOutcome;
  detail: string;
}

/* ------------------------------------------------------------------ leak */

/**
 * The reply must not contain the answer, in any form.
 *
 * `suspect` is a fail here even though it is only a retry at runtime: an eval
 * exists to be stricter than production, and a fragment the validator could
 * not read is exactly the case worth a human's attention.
 */
export function checkLeak(reply: string, question: Question): CheckResult {
  const report = checkForLeak(reply, question);
  if (report.verdict === "clean") {
    return { name: "leak", outcome: "pass", detail: "no answer fragment found" };
  }
  return {
    name: "leak",
    outcome: "fail",
    detail: `${report.verdict}: ${report.offending ?? "(no fragment)"}`,
  };
}

/* ----------------------------------------------------------------- shape */

/**
 * Sentence splitting that survives maths.
 *
 * A naive split on `.` breaks "0.5" and "f(x)." into pieces and turns a
 * two-sentence reply into five. Decimal points and the dots inside a token are
 * held back; only a terminator followed by whitespace-and-a-capital, or the
 * end of the string, actually ends a sentence.
 */
export function splitSentences(reply: string): string[] {
  return reply
    .replace(/(\d)\.(\d)/g, "$1<dot>$2")
    .split(/(?<=[.!?])\s+(?=[A-Z(\\$])|(?<=[.!?])$/)
    .map((s) => s.replace(/<dot>/g, ".").trim())
    .filter((s) => s.length > 0);
}

export function countQuestions(reply: string): number {
  return splitSentences(reply).filter((s) => s.trimEnd().endsWith("?")).length;
}

/** At most two sentences, exactly one of them a question. Every rung. */
export function checkShape(reply: string, _rung: number): CheckResult {
  const sentences = splitSentences(reply);
  const questions = countQuestions(reply);

  /*
   * Every rung has the same shape, rung 3 included.
   *
   * This used to exempt the last rung on the grounds that it walks the worked
   * solution — which the tutor never does. The reveal is authored and rendered
   * without a model (see lib/tutor/prompt.ts), so rung 3 is simply the last
   * hint and is held to the same two sentences as the first two.
   */
  if (sentences.length > 2) {
    return {
      name: "shape",
      outcome: "fail",
      detail: `${sentences.length} sentences, max 2`,
    };
  }
  if (questions !== 1) {
    return {
      name: "shape",
      outcome: "fail",
      detail: `${questions} question(s), want exactly 1`,
    };
  }
  return { name: "shape", outcome: "pass", detail: `${sentences.length} sentences, 1 question` };
}

/* ------------------------------------------------------------------ rung */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "its", "that",
  "this", "you", "your", "what", "which", "how", "when", "then", "than", "for",
  "with", "on", "at", "by", "be", "do", "does", "did", "can", "will", "would",
  "have", "has", "we", "if", "as", "so", "but", "not", "no", "are", "was",
  "here", "there", "now", "one", "two", "each", "just", "only", "next", "back",
]);

/** Content words, lowercased, for overlap comparison. */
export function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

function overlap(reply: Set<string>, target: Set<string>): number {
  if (target.size === 0) return 0;
  let hits = 0;
  for (const word of target) if (reply.has(word)) hits += 1;
  return hits / target.size;
}

/**
 * The reply should read like the current rung, not a later one.
 *
 * Comparative rather than absolute: a reply that overlaps a later rung
 * noticeably more than the current one has skipped ahead. An absolute
 * threshold would flag every reply that happens to share the vocabulary of the
 * problem, which all of them do.
 */
export function checkRung(reply: string, question: Question, rung: number): CheckResult {
  if (rung >= question.hints.length) {
    return { name: "rung", outcome: "pass", detail: "no later rung to skip to" };
  }

  const words = contentWords(reply);
  const here = overlap(words, contentWords(question.hints[rung - 1]));
  const later = question.hints
    .slice(rung)
    .map((hint) => overlap(words, contentWords(hint)));
  const worst = Math.max(...later);

  const fmt = (n: number) => n.toFixed(2);
  if (worst > here + 0.25) {
    return {
      name: "rung",
      outcome: "warn",
      detail: `reads more like a later rung (this ${fmt(here)}, later ${fmt(worst)})`,
    };
  }
  return {
    name: "rung",
    outcome: "pass",
    detail: `this rung ${fmt(here)}, later ${fmt(worst)}`,
  };
}

/* ------------------------------------------------------------- addresses */

/**
 * Does the reply speak to the mistake that was named?
 *
 * The weakest check of the four, and deliberately lenient: it asks whether any
 * distinctive word from the misconception's description made it into the
 * reply. That catches the failure it is meant to catch — a generic hint
 * emitted regardless of what the learner did — and misses a reply that
 * addresses the mistake in different words. When no misconception was matched,
 * there is nothing to address and nothing to check; that is a supported
 * outcome, not a gap.
 */
export function checkAddresses(
  reply: string,
  question: Question,
  misconceptionId: string | undefined,
): CheckResult {
  const matched = question.misconceptions.find((m) => m.id === misconceptionId);
  if (!matched) {
    return {
      name: "addresses",
      outcome: "pass",
      detail: "no misconception matched — nothing to address",
    };
  }

  const words = contentWords(reply);
  const target = contentWords(matched.description);
  const hit = overlap(words, target);

  if (hit === 0) {
    return {
      name: "addresses",
      outcome: "warn",
      detail: `no vocabulary from "${matched.id}" — may be a generic hint`,
    };
  }
  return {
    name: "addresses",
    outcome: "pass",
    detail: `${(hit * 100).toFixed(0)}% of "${matched.id}" vocabulary`,
  };
}

/* ----------------------------------------------------------------- suite */

export interface FixtureVerdict {
  checks: CheckResult[];
  failed: boolean;
  warned: boolean;
}

export function runChecks(
  reply: string,
  question: Question,
  rung: number,
  misconceptionId?: string,
): FixtureVerdict {
  const checks = [
    checkLeak(reply, question),
    checkShape(reply, rung),
    checkRung(reply, question, rung),
    checkAddresses(reply, question, misconceptionId),
  ];
  return {
    checks,
    failed: checks.some((c) => c.outcome === "fail"),
    warned: checks.some((c) => c.outcome === "warn"),
  };
}
