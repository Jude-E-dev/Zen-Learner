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
    bestStreak, tier, rankId, rankName, pauses, unstuck, avatar, topic, times,
  } = summary;

  const drillName = topic === "mental-math" ? "MENTAL MATH" : "CALCULUS";
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        className="pixel-frame bg-ink-soft flex aspect-square w-full max-w-[420px] flex-col justify-between p-7"
        data-testid="summary-card"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bitmap text-jade text-label tracking-wordmark">ZEN MODE</p>
            <p className="text-paper-dim mt-1 text-label tracking-label">
              {drillName} · SESSION {sessionNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="text-paper-dim text-label tracking-label">RANK</p>
            <p className="text-indigo text-lg leading-tight">{rankName}</p>
          </div>
        </div>

        {/* Fills the room the square left over, and makes the card yours. */}
        <Dojo
          mood="idle"
          combo={bestStreak}
          avatar={avatar}
          rankId={rankId}
          size="card"
        />

        <div className="flex items-end justify-between gap-4">
          {answered === 0 ? (
            /*
              A session ended with nothing answered has no accuracy, and the
              card used to say `0%` at 6xl anyway — the largest thing on the
              screen, reading as a verdict on the learner when the honest
              reading is "there is nothing here to report". The number is not
              faked or hidden: it is dropped, because it does not exist, and
              what replaces it is the same size as the cells below rather than
              a headline.
            */
            <div className="flex flex-col gap-1">
              <span className="text-paper-dim text-label tracking-label">
                THIS SESSION
              </span>
              <span className="font-bitmap text-paper text-2xl leading-none tracking-label">
                NOTHING SCORED
              </span>
              <span className="text-paper-dim text-xs">
                Ended before a question was answered. Nothing lost.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-paper-dim text-label tracking-label">ACCURACY</span>
              <span className="font-bitmap text-gold text-6xl leading-none tabular-nums">
                {accuracy}
                {/* Monospace: Silkscreen's percent sign sits low against its own digits. */}
                <span className="font-pixel text-2xl">%</span>
              </span>
              <span className="text-paper-dim text-xs">
                {correct} of {answered} answered
              </span>
            </div>
          )}

          {/*
            On a timed drill the times are the headline beside accuracy —
            being right is the floor, being quick is the point. Pauses only
            get the corner when there is no clock to report.
          */}
          {times ? (
            <p className="text-paper-dim text-label pb-1 text-right leading-relaxed tracking-label">
              FASTEST <span className="text-jade">{secs(times.fastest)}</span>
              <br />
              TYPICAL <span className="text-paper">{secs(times.median)}</span>
            </p>
          ) : (
            pauses > 0 && (
              <p className="text-paper-dim text-label pb-1 text-right leading-relaxed tracking-label">
                PAUSED {pauses}×
                <br />
                GOT UNSTUCK {unstuck}×
              </p>
            )
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
      <dt className="text-paper-dim text-label tracking-label">{label}</dt>
      <dd className={`${tone} text-2xl leading-none tabular-nums`}>{value}</dd>
    </div>
  );
}
