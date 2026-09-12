"use client";

import { MAX_TIER, PROMOTE_AFTER, DEMOTE_AFTER } from "@/lib/game/selector";
import type { SessionState } from "@/lib/game/session";
import type { RankProgress } from "@/lib/game/ranks";

/**
 * Persistent HUD.
 *
 * The mastery gate has to be legible from the first session (constraint #5), so
 * the promote/demote counters are shown as filled pips rather than hidden in
 * the model. A learner should be able to see "one more and I move up" without
 * being told.
 *
 * What this does NOT show is progress toward the next rank. RankBar sits
 * directly underneath and says the same thing as two filled bars, which is
 * the better telling of it. This header used to carry a "TO BUSHI 0/5 correct
 * at T2+ · —/60%" stat as well, so the screen stated the same requirement
 * twice, eight pixels apart, in two different formats.
 */
export function Hud({
  state,
  rank,
}: {
  state: SessionState;
  rank: RankProgress;
}) {
  const { selector, xp, streak, answered, correct } = state;
  const accuracy = answered === 0 ? null : Math.round((correct / answered) * 100);

  return (
    <header className="pixel-frame bg-ink-soft flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
      <Stat label="RANK">
        <span className="font-bitmap text-indigo text-lg">{rank.current.name}</span>
      </Stat>

      <Stat label="TIER">
        <span className="text-gold text-lg">{selector.tier}</span>
        <span className="text-paper-dim">/{MAX_TIER}</span>
        {selector.atCap && (
          <span className="text-jade ml-2 text-label tracking-label">AT CAP</span>
        )}
      </Stat>

      <Stat label="XP">
        <span className="text-jade text-lg tabular-nums">{xp}</span>
      </Stat>

      <Stat label="STREAK">
        <span className="text-lg tabular-nums">{streak}</span>
      </Stat>

      <Stat label="ACCURACY">
        <span className="tabular-nums">{accuracy === null ? "—" : `${accuracy}%`}</span>
        <span className="text-paper-dim ml-1 text-label">({answered})</span>
      </Stat>

      {/* The gate itself, made visible. */}
      <div className="ml-auto flex items-center gap-6">
        <Gate
          label="TO PROMOTE"
          filled={selector.correctStreak}
          total={PROMOTE_AFTER}
          tone="jade"
          disabled={selector.tier >= MAX_TIER}
        />
        <Gate
          label="TO DEMOTE"
          filled={selector.wrongStreak}
          total={DEMOTE_AFTER}
          tone="blood"
          disabled={selector.tier <= 1}
        />
      </div>
    </header>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-paper-dim text-label tracking-label">{label}</span>
      <span className="leading-none">{children}</span>
    </div>
  );
}

function Gate({
  label,
  filled,
  total,
  tone,
  disabled,
}: {
  label: string;
  filled: number;
  total: number;
  tone: "jade" | "blood";
  disabled: boolean;
}) {
  const onColor = tone === "jade" ? "bg-jade" : "bg-blood";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-paper-dim text-label tracking-label">
        {disabled ? `${label} (—)` : label}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-3 w-3 border-2 border-ink-line ${
              !disabled && i < filled ? onColor : "bg-ink"
            }`}
          />
        ))}
      </div>
      <span className="sr-only">
        {filled} of {total} toward {label.toLowerCase()}
      </span>
    </div>
  );
}
