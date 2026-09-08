"use client";

import { MAX_TIER } from "@/lib/game/selector";
import { Dojo } from "@/components/Dojo";
import type { Summary } from "@/lib/summary/summary";

/**
 * The post-session card, composed to be screenshotted.
 *
 * Square by construction so it survives being dropped into a chat or a feed
 * without cropping, and every number is one a person would actually want to
 * show someone: what you got through, how deep you went, how long you held it
 * together.
 *
 * It takes a plain Summary rather than the live session, which is what lets
 * the same card render from a permalink. A shared card and a just-finished one
 * are the same component reading the same shape.
 *
 * The ronin is on it because a card with *your* ronin is a different object
 * from a card with a percentage on it, and sharing is the only distribution
 * channel this thing has.
 */
export function SummaryCard({
  summary,
  actions,
}: {
  summary: Summary;
  /** Buttons under the card. A shared card has different ones to a live one. */
  actions?: React.ReactNode;
}) {
  const {
    sessionNumber, answered, correct, accuracy, xp,
    bestStreak, tier, rankId, rankName, pauses, unstuck, avatar,
  } = summary;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        className="pixel-frame bg-ink-soft flex aspect-square w-full max-w-[420px] flex-col justify-between p-7"
        data-testid="summary-card"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bitmap text-jade text-label tracking-[0.3em]">ZEN MODE</p>
            <p className="text-paper-dim mt-1 text-label tracking-[0.2em]">
              CALCULUS · SESSION {sessionNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="text-paper-dim text-label tracking-[0.2em]">RANK</p>
            <p className="text-indigo text-lg leading-tight">{rankName}</p>
          </div>
        </div>

        {/* Fills the room the square left over, and makes the card yours. */}
        <Dojo
          mood="idle"
          combo={bestStreak}
          avatar={avatar}
          rankId={rankId}
          className="h-24 shrink-0"
        />

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-paper-dim text-label tracking-widest">ACCURACY</span>
            <span className="font-bitmap text-gold text-6xl leading-none tabular-nums">
              {accuracy}
              {/* Monospace: Silkscreen's percent sign sits low against its own digits. */}
              <span className="font-pixel text-2xl">%</span>
            </span>
            <span className="text-paper-dim text-xs">
              {correct} of {answered} answered
            </span>
          </div>

          {pauses > 0 && (
            <p className="text-paper-dim text-label pb-1 text-right leading-relaxed tracking-widest">
              PAUSED {pauses}×
              <br />
              GOT UNSTUCK {unstuck}×
            </p>
          )}
        </div>

        <dl className="border-ink-line grid grid-cols-3 gap-3 border-t-2 pt-4">
          <Cell label="XP" value={xp} tone="text-jade" />
          <Cell label="BEST RUN" value={bestStreak} tone="text-paper" />
          <Cell label="TIER" value={`${tier}/${MAX_TIER}`} tone="text-gold" />
        </dl>
      </div>

      {actions}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-paper-dim text-label tracking-widest">{label}</dt>
      <dd className={`${tone} text-2xl leading-none tabular-nums`}>{value}</dd>
    </div>
  );
}
