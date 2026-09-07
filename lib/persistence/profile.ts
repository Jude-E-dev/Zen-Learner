import type { SessionState } from "../game/session";
import { recordAnswer, type MasteryStats } from "../game/ranks";
import type { Profile, StoredEvent } from "./store";

/**
 * Folding a session into the durable profile.
 *
 * Mastery is rebuilt from the session's own events rather than from running
 * counters, so what gets persisted is exactly what happened. Unreadable
 * submissions never appear here — they are not attempts and must not move
 * lifetime accuracy, which is the number ranks are gated on.
 */

export function masteryWithSession(
  base: MasteryStats,
  state: SessionState,
): MasteryStats {
  return state.events.reduce((stats, event) => {
    if (event.type !== "answer_submitted") return stats;
    return recordAnswer(stats, event.tier, event.verdict === "correct");
  }, base);
}

export function mergeSession(
  profile: Profile,
  state: SessionState,
  now = Date.now(),
): Profile {
  return {
    ...profile,
    totalXp: profile.totalXp + state.xp,
    bestStreak: Math.max(profile.bestStreak, state.bestStreak),
    mastery: masteryWithSession(profile.mastery, state),
    sessions: profile.sessions + 1,
    lastSessionAt: now,
  };
}

/**
 * A browser cannot append to a file on disk, so events buffer in IndexedDB and
 * leave through here as one JSONL blob the analytics script can read.
 */
export function toJsonl(rows: StoredEvent[]): string {
  return rows
    .map((row) => JSON.stringify({ session: row.session, ...row.event }))
    .join("\n");
}

export function downloadJsonl(rows: StoredEvent[], filename = "zen-events.jsonl") {
  const blob = new Blob([`${toJsonl(rows)}\n`], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
