import { z } from "zod";
import type { SessionState } from "../game/session";
import { AVATAR_SLOTS, normalizeAvatar, type AvatarChoice } from "../game/avatar";
import { RANKS } from "../game/ranks";

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
  /** Hat, robe, obi — so a shared card wears the ronin that earned it. */
  av: z.tuple([z.string().max(32), z.string().max(32), z.string().max(32)]),
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
    avatar: normalizeAvatar({
      hat: blob.av[0],
      robe: blob.av[1],
      obi: blob.av[2],
    }),
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
    av: AVATAR_SLOTS.map((slot) => summary.avatar[slot]) as [string, string, string],
  };
}

/** Build the summary for a session that has just ended. */
export function summaryFromSession(
  state: SessionState,
  rankId: string,
  sessionNumber: number,
  avatar: AvatarChoice,
): Summary {
  const { answered, correct, xp, bestStreak, selector, events } = state;

  const pauses = events.filter((e) => e.type === "pause_invoked").length;
  // Did getting unstuck actually work? This is hypothesis one, on the card.
  const unstuck = events.filter(
    (e) => e.type === "answer_submitted" && e.verdict === "correct" && e.afterPause,
  ).length;

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
  };
}
