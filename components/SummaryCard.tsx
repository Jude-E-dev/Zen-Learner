"use client";

import type { SessionState } from "@/lib/game/session";
import { MAX_TIER } from "@/lib/game/selector";

/**
 * The post-session card, composed to be screenshotted.
 *
 * Square by construction so it survives being dropped into a chat or a feed
 * without cropping, and every number is one a person would actually want to
 * show someone: what you got through, how deep you went, how long you held it
 * together. Permalink encoding lands in stage 6; this is the artifact itself.
 */
export function SummaryCard({
  state,
  onRestart,
}: {
  state: SessionState;
  onRestart: () => void;
}) {
  const { answered, correct, xp, bestStreak, selector, events } = state;
  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  const pauses = events.filter((e) => e.type === "pause_invoked").length;

  // Did getting unstuck actually work? This is hypothesis one, on screen.
  const unstuck = events.filter(
    (e) => e.type === "answer_submitted" && e.verdict === "correct" && e.afterPause,
  ).length;

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="pixel-frame bg-ink-soft flex aspect-square w-full max-w-[420px] flex-col justify-between p-7"
        data-testid="summary-card"
      >
        <div>
          <p className="text-jade text-[10px] tracking-[0.3em]">ZEN MODE</p>
          <p className="text-paper-dim mt-1 text-[10px] tracking-[0.2em]">
            CALCULUS · SESSION COMPLETE
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-paper-dim text-[10px] tracking-widest">ACCURACY</span>
          <span className="text-gold text-6xl leading-none tabular-nums">
            {accuracy}
            <span className="text-2xl">%</span>
          </span>
          <span className="text-paper-dim text-xs">
            {correct} of {answered} answered
          </span>
        </div>

        <dl className="grid grid-cols-3 gap-3 border-t-2 border-ink-line pt-4">
          <Cell label="XP" value={xp} tone="jade" />
          <Cell label="BEST RUN" value={bestStreak} />
          <Cell label="TIER" value={`${selector.tier}/${MAX_TIER}`} tone="gold" />
        </dl>

        {pauses > 0 && (
          <p className="text-paper-dim text-[10px] leading-relaxed">
            PAUSED {pauses}× · GOT UNSTUCK {unstuck}×
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onRestart}
        autoFocus
        className="pixel-frame-hot text-jade bg-ink px-5 py-2 text-xs tracking-[0.2em] hover:bg-ink-soft"
      >
        GO AGAIN
      </button>
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
  tone?: "jade" | "gold";
}) {
  const color = tone === "jade" ? "text-jade" : tone === "gold" ? "text-gold" : "text-paper";
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-paper-dim text-[10px] tracking-widest">{label}</dt>
      <dd className={`${color} text-xl leading-none tabular-nums`}>{value}</dd>
    </div>
  );
}
