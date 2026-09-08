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
        <span className="text-gold text-label tracking-[0.25em]">
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
      <div className="flex items-baseline justify-between text-label tracking-[0.25em]">
        <span className="text-indigo">{rank.current.name.toUpperCase()}</span>
        <span className="text-paper-dim">
          NEXT: <span className="text-paper">{rank.next.name.toUpperCase()}</span>
        </span>
      </div>

      <Track
        label={`${Math.min(rank.correct, rank.correctRequired)}/${rank.correctRequired} at T${rank.next.tierFloor}+`}
        fill={volume}
        tone="jade"
      />
      <Track
        label={
          rank.accuracy === null
            ? `— / ${Math.round(rank.accuracyRequired * 100)}%`
            : `${Math.round(rank.accuracy * 100)}% / ${Math.round(rank.accuracyRequired * 100)}%`
        }
        fill={accuracy}
        tone={accuracyMet ? "jade" : "gold"}
      />
    </div>
  );
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
      {/* Segmented, not smooth — a continuous bar would read as the wrong era. */}
      <div className="flex grow gap-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-2 grow ${i < lit ? color : "bg-ink-line/50"}`}
          />
        ))}
      </div>
      <span className="text-paper-dim w-28 shrink-0 text-right text-label tabular-nums">
        {label}
      </span>
    </div>
  );
}
