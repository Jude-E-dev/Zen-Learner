import { z } from "zod";
import type { SessionState } from "../game/session";
import { AVATAR_SLOTS, normalizeAvatar, type AvatarChoice } from "../game/avatar";
import { RANKS } from "../game/ranks";
import { TOPICS, type Topic } from "../content/schema";

/**
 * What a finished session is, once it stops being a running session.
 *
 * The card used to render straight off SessionState and RankProgress, which
 * are live objects full of things a summary has no business carrying — the
 * question pool cursor, the selector's internal counters, the whole event log.
 * A permalink cannot hold any of that, and should not: everything here is a
 * number or an id that a person would actually want to show someone.
 *
 * This is the one shape both paths produce. A just-finished session builds it
 * from state; a shared link builds it from the URL. The card cannot tell them
 * apart, which is the point.
 */

export const summarySchema = z.object({
  /** Bumped only when a field changes meaning; old links must keep working. */
  v: z.literal(1),
  /** Which session this was, for the learner's own sense of progress. */
  n: z.number().int().min(1).max(100_000),
  a: z.number().int().min(0).max(100_000),
  c: z.number().int().min(0).max(100_000),
  x: z.number().int().min(0).max(10_000_000),
  s: z.number().int().min(0).max(100_000),
  t: z.number().int().min(1).max(5),
  r: z.enum(RANKS.map((rank) => rank.id) as [string, ...string[]]),
  p: z.number().int().min(0).max(100_000),
  u: z.number().int().min(0).max(100_000),
  /**
   * The kit, positionally by AVATAR_SLOTS, so a shared card wears the ronin
   * that earned it. Length is a range rather than a fixed tuple: a link
   * written before a slot existed is still a good link, and normalizeAvatar
   * fills whatever is missing with that slot's default.
   */
  av: z.array(z.string().max(32)).min(1).max(8),
  /**
   * Which drill this was. Optional, because links written before mental math
   * existed are still good links — they were all calculus.
   */
  d: z.enum(TOPICS).optional(),
  /** Median and fastest answer, in ms. Only meaningful for a timed drill. */
  ms: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
});

export type SummaryBlob = z.infer<typeof summarySchema>;

export interface Summary {
  sessionNumber: number;
  answered: number;
  correct: number;
  accuracy: number;
  xp: number;
  bestStreak: number;
  tier: number;
  rankId: string;
  rankName: string;
  pauses: number;
  unstuck: number;
  avatar: AvatarChoice;
  topic: Topic;
  /** Median and fastest answer in ms, or null when the drill was not timed. */
  times: { median: number; fastest: number } | null;
}

function rankNameFor(id: string): string {
  return RANKS.find((rank) => rank.id === id)?.name ?? RANKS[0].name;
}

/**
 * Correct answers cannot exceed answered, and a card claiming otherwise is
 * either corrupt or forged. Clamping rather than rejecting keeps a shared link
 * readable; the numbers are cosmetic and nothing downstream trusts them.
 */
export function summaryFromBlob(blob: SummaryBlob): Summary {
  const answered = blob.a;
  const correct = Math.min(blob.c, answered);

  return {
    sessionNumber: blob.n,
    answered,
    correct,
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    xp: blob.x,
    bestStreak: blob.s,
    tier: blob.t,
    rankId: blob.r,
    rankName: rankNameFor(blob.r),
    pauses: blob.p,
    unstuck: Math.min(blob.u, correct),
    avatar: normalizeAvatar(
      Object.fromEntries(AVATAR_SLOTS.map((slot, i) => [slot, blob.av[i]])),
    ),
    topic: blob.d ?? "calculus",
    times: blob.ms ? { median: blob.ms[0], fastest: blob.ms[1] } : null,
  };
}

export function blobFromSummary(summary: Summary): SummaryBlob {
  return {
    v: 1,
    n: summary.sessionNumber,
    a: summary.answered,
    c: summary.correct,
    x: summary.xp,
    s: summary.bestStreak,
    t: summary.tier,
    r: summary.rankId,
    p: summary.pauses,
    u: summary.unstuck,
    av: AVATAR_SLOTS.map((slot) => summary.avatar[slot]),
    d: summary.topic,
    ...(summary.times
      ? { ms: [summary.times.median, summary.times.fastest] as [number, number] }
      : {}),
  };
}

/** Build the summary for a session that has just ended. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function summaryFromSession(
  state: SessionState,
  rankId: string,
  sessionNumber: number,
  avatar: AvatarChoice,
  topic: Topic = "calculus",
  timed = false,
): Summary {
  const { answered, correct, xp, bestStreak, selector, events } = state;

  const pauses = events.filter((e) => e.type === "pause_invoked").length;
  // Did getting unstuck actually work? This is hypothesis one, on the card.
  const unstuck = events.filter(
    (e) => e.type === "answer_submitted" && e.verdict === "correct" && e.afterPause,
  ).length;

  /*
   * Only correct answers count toward a time. A wrong answer you abandoned
   * after two seconds is not a fast answer, and letting it in would make the
   * fastest column reward giving up.
   */
  const solved = state.events
    .filter((e) => e.type === "answer_submitted" && e.verdict === "correct")
    .map((e) => (e as { latencyMs: number }).latencyMs)
    .filter((ms) => Number.isFinite(ms) && ms >= 0);

  return {
    sessionNumber,
    answered,
    correct,
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 100),
    xp,
    bestStreak,
    tier: selector.tier,
    rankId,
    rankName: rankNameFor(rankId),
    pauses,
    unstuck,
    avatar,
    topic,
    times:
      timed && solved.length > 0
        ? { median: median(solved), fastest: Math.min(...solved) }
        : null,
  };
}
