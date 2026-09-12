"use client";

import type { RankProgress } from "@/lib/game/ranks";

/**
 * Progress toward the next rank, as a bar rather than a sentence.
 *
 * A rank needs two things at once — enough correct answers at the tier floor,
 * AND accuracy above the bar — so this shows both as separate fills. That
 * matters: a learner who has done the volume but is short on accuracy should be
 * able to see instantly that grinding more is not what is missing.
 */
export function RankBar({ rank }: { rank: RankProgress }) {
  if (!rank.next) {
    return (
      <div className="flex items-center gap-3 px-1">
        <span className="text-gold text-label tracking-title">
          {rank.current.name.toUpperCase()} — TOP RANK
        </span>
        <div className="bg-gold h-2 grow" />
      </div>
    );
  }

  const volume = Math.min(1, rank.correct / rank.correctRequired);
  const accuracy =
    rank.accuracy === null ? 0 : Math.min(1, rank.accuracy / rank.accuracyRequired);
  const accuracyMet = rank.accuracy !== null && rank.accuracy >= rank.accuracyRequired;

  return (
    <div className="flex flex-col gap-1.5 px-1">
      {/* The current rank is the HUD's to state, and it states it larger. This
          row names only where the bars are going. */}
      <div className="text-label tracking-title">
        <span className="text-paper-dim">
          NEXT: <span className="text-paper">{rank.next.name.toUpperCase()}</span>
        </span>
      </div>

      {notStarted(rank) ? (
        /*
          Nothing answered at the next rank's floor yet, so there is no
          progress to draw — and drawing it anyway was the bug. Two full-width
          rows of unlit segments read as a loading skeleton: a fresh learner
          sits at tier 1 while the next rank counts tier 2 and above, so this
          is the state the bar spends its first session in, and it looked
          broken rather than empty. One line of prose says the same thing
          honestly and doubles as the instruction for clearing it.
        */
        <p className="text-paper-dim text-label tracking-label">
          {`NOTHING AT T${rank.next.tierFloor}+ YET — ${rank.correctRequired} CORRECT AT ${Math.round(rank.accuracyRequired * 100)}% EARNS IT`}
        </p>
      ) : (
        <>
          <Track
            label={`${Math.min(rank.correct, rank.correctRequired)}/${rank.correctRequired} at T${rank.next.tierFloor}+`}
            fill={volume}
            tone="jade"
          />
          <Track
            label={`${Math.round(rank.accuracy! * 100)}% / ${Math.round(rank.accuracyRequired * 100)}%`}
            fill={accuracy}
            tone={accuracyMet ? "jade" : "gold"}
          />
        </>
      )}
    </div>
  );
}

/**
 * Whether there is anything to draw yet.
 *
 * `accuracy` is null exactly when nothing has been answered at or above the
 * next rank's tier floor (ranks.ts), which is the same condition as "these
 * bars would both be empty" — a learner cannot have correct answers at a floor
 * they have not answered at. Having answered and got them all wrong is a
 * different state and keeps the bars, because then the labels carry real
 * numbers and there is progress to lose.
 */
export function notStarted(rank: RankProgress): boolean {
  return rank.next !== null && rank.accuracy === null;
}

const SEGMENTS = 32;

function Track({
  label,
  fill,
  tone,
}: {
  label: string;
  fill: number;
  tone: "jade" | "gold";
}) {
  const lit = Math.round(fill * SEGMENTS);
  const color = tone === "jade" ? "bg-jade" : "bg-gold";

  return (
    <div className="flex items-center gap-3">
      {/* Segmented, not smooth — a continuous bar would read as the wrong era.
          An unlit segment is ink-soft, the app's own surface tone, rather than
          a fourth grey mixed out of ink-line at the call site. */}
      <div className="flex grow gap-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-2 grow ${i < lit ? color : "bg-ink-soft"}`}
          />
        ))}
      </div>
      <span className="text-paper-dim w-28 shrink-0 text-right text-label tabular-nums">
        {label}
      </span>
    </div>
  );
}
