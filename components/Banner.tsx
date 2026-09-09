"use client";

import { useEffect, useState } from "react";

/**
 * The loud moments.
 *
 * A rank-up is the payoff for work done over many sessions, so it gets the
 * whole screen for a beat. It deliberately does NOT block input: the stream
 * keeps running underneath and typing carries on, because a modal here would
 * reintroduce exactly the stop we just removed from the answer flow.
 *
 * Under `prefers-reduced-motion` the movement is cut and the message simply
 * appears and leaves. The state change is never hidden, only the animation.
 */

export type BannerKind = "rank-up" | "tier-up" | "tier-down" | "at-cap";

export interface BannerMessage {
  kind: BannerKind;
  title: string;
  detail?: string;
  /** Bumped per occurrence so a repeat of the same message replays. */
  seq: number;
}

const HOLD_MS: Record<BannerKind, number> = {
  "rank-up": 2600,
  "tier-up": 1500,
  "tier-down": 1500,
  "at-cap": 1800,
};

export function Banner({ message }: { message: BannerMessage | null }) {
  const [visible, setVisible] = useState<BannerMessage | null>(null);

  useEffect(() => {
    if (!message) return;
    setVisible(message);
    const timer = setTimeout(() => setVisible(null), HOLD_MS[message.kind]);
    return () => clearTimeout(timer);
  }, [message?.seq, message?.kind, message]);

  const big = visible?.kind === "rank-up";

  /*
   * The live region is mounted always, and empty when there is nothing to say.
   *
   * It used to sit on the overlay below, which returns null when idle — so the
   * region was inserted into the tree with its message already inside it.
   * Screen readers announce mutations *within* a region that was already
   * present; one that appears fully-formed is normally silent. The rank-up is
   * the payoff for weeks of work, it is `pointer-events-none` and purely
   * visual, and it was being announced to nobody.
   *
   * Separating the two also lets the announcement be a plain sentence rather
   * than the three styled fragments the overlay is composed of.
   */
  const announcement = visible
    ? `${labelFor(visible.kind)}: ${visible.title}${visible.detail ? `. ${visible.detail}` : ""}`
    : "";

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {visible && (
        <BannerOverlay visible={visible} big={big} />
      )}
    </>
  );
}

function BannerOverlay({
  visible,
  big,
}: {
  visible: BannerMessage;
  big: boolean;
}) {
  return (
    <div
      // Pointer events off so the grind underneath stays fully usable.
      // aria-hidden because the sr-only region above already says this, and
      // saying it twice is worse than not saying it at all.
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* A rank is weeks of work paying off, so it gets the whole screen for a
          beat. Tier moves are frequent and stay quiet by comparison. */}
      {big && <div key={`scrim-${visible.seq}`} className="anim-quiet absolute inset-0 bg-ink/85" />}

      <div
        key={visible.seq}
        className={`anim-quiet relative flex flex-col items-center ${
          big
            ? "pixel-frame-hot bg-ink gap-3 px-16 py-10"
            : "pixel-frame bg-ink/90 gap-2 px-10 py-6"
        }`}
      >
        <span
          className={`tracking-[0.4em] ${
            visible.kind === "tier-down" ? "text-blood" : "text-jade"
          } ${big ? "text-sm" : "text-label"}`}
        >
          {labelFor(visible.kind)}
        </span>

        {/*
          The display face, which this was missing.

          This is the largest type in the product and the payoff the whole
          progression exists to hand out — and it rendered in the monospace
          body stack while `Hud` rendered the very same rank name in
          Silkscreen a few pixels away. The face's stated job is short
          uppercase labels, headings and big numerals; the two things this
          span ever carries are a rank name at 72px and "TIER 3" at 24px.
        */}
        <span
          className={`font-bitmap ${
            big ? "text-gold text-7xl" : "text-paper text-2xl"
          } leading-none`}
        >
          {visible.title}
        </span>

        {visible.detail && (
          <span
            className={`text-center leading-relaxed ${
              big ? "text-paper mt-2 text-sm" : "text-paper-dim mt-1 text-xs"
            }`}
          >
            {visible.detail}
          </span>
        )}

        {big && (
          <div aria-hidden className="mt-3 flex gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="bg-jade h-2 w-8" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor(kind: BannerKind): string {
  switch (kind) {
    case "rank-up":
      return "RANK EARNED";
    case "tier-up":
      return "TIER UP";
    case "tier-down":
      return "TIER DOWN";
    case "at-cap":
      return "TOP TIER HELD";
  }
}
