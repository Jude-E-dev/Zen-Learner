import { DAILY_PAUSE_QUOTA } from "./config";

/**
 * Five AI-tutored pauses a day, counted against the device's own clock.
 *
 * The day boundary is local midnight per the device, and that is a decision
 * rather than an oversight (design doc constraint #4): the stack has no server
 * and therefore no trustworthy clock. A learner who changes their system time
 * gets more pauses, and that is fine — the quota exists to bound spend on
 * normal use, and the actual bound on abuse is the provider spend cap.
 *
 * What the quota does NOT do is stop the pause. Running out disables the AI
 * layer for the rest of the day and drops to the authored ladder, which is
 * the same thing that happens when the key is missing — a degraded tutor, not
 * a locked door.
 */

export interface PauseQuota {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  used: number;
}

/**
 * The local day as a string, not a timestamp.
 *
 * Comparing a stored date to today's date is the whole boundary rule, and a
 * string comparison cannot drift the way "is this within 24 hours" does across
 * a daylight-saving change.
 */
export function localDay(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyQuota(now: Date = new Date()): PauseQuota {
  return { day: localDay(now), used: 0 };
}

/** Yesterday's count is not today's. Rolls the day over rather than decaying. */
export function quotaForToday(
  quota: PauseQuota,
  now: Date = new Date(),
): PauseQuota {
  const today = localDay(now);
  return quota.day === today ? quota : { day: today, used: 0 };
}

export function remainingPauses(
  quota: PauseQuota,
  now: Date = new Date(),
): number {
  return Math.max(0, DAILY_PAUSE_QUOTA - quotaForToday(quota, now).used);
}

export function hasQuota(quota: PauseQuota, now: Date = new Date()): boolean {
  return remainingPauses(quota, now) > 0;
}

/**
 * Spend one pause.
 *
 * Counted when the request is made, not when it succeeds. A tutored reply the
 * learner did not like still cost money, and a quota that only counted useful
 * answers would be a quota an unlucky session could exceed indefinitely.
 * Requests that never reach the provider — no key configured, quota already
 * gone — are not spent here, because the caller does not get that far.
 */
export function spendPause(
  quota: PauseQuota,
  now: Date = new Date(),
): PauseQuota {
  const today = quotaForToday(quota, now);
  return { ...today, used: today.used + 1 };
}

export function normalizeQuota(raw: unknown): PauseQuota {
  if (!raw || typeof raw !== "object") return emptyQuota();
  const candidate = raw as Partial<PauseQuota>;
  if (typeof candidate.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.day)) {
    return emptyQuota();
  }
  const used = candidate.used;
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0) {
    return { day: candidate.day, used: 0 };
  }
  return { day: candidate.day, used: Math.floor(used) };
}
