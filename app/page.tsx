"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import questionData from "@/lib/content/generated.json";
import type { Question } from "@/lib/content/schema";
import { Dojo } from "@/components/Dojo";
import { AvatarPicker } from "@/components/AvatarPicker";
import { useProfile } from "@/lib/persistence/useProfile";
import { rankFor } from "@/lib/game/ranks";
import type { AvatarChoice } from "@/lib/game/avatar";

const POOL = questionData as unknown as Question[];

const SUBTOPICS = [...new Set(POOL.map((q) => q.subtopic))].sort();
const TIERS = [1, 2, 3, 4, 5].map((t) => POOL.filter((q) => q.tier === t).length);
const MAX_TIER_COUNT = Math.max(...TIERS);

/**
 * The front door.
 *
 * The hall grows to fill whatever height is left, exactly as it does on the
 * play screen. That is the whole fix for the dead space this page used to
 * have: the old layout centred a fixed-height block inside min-h-screen, so
 * leftover height split into empty bands above and below it. Nothing here was
 * ever asking to grow, because there was no scene on this page to grow.
 *
 * Putting the ronin here also gives the page a subject, closes the gap between
 * a terminal-looking front door and a pixel-art practice hall, and is the
 * surface the armoury needs anyway.
 */
export default function TopicSelect() {
  const router = useRouter();
  const { profile, ready, saveAvatar } = useProfile();
  const [armoury, setArmoury] = useState(false);

  const rank = rankFor(profile.mastery);
  const returning = profile.sessions > 0;

  const begin = useCallback(() => {
    router.push("/play");
  }, [router]);

  /*
   * Enter starts a session, matching the play screen where Enter submits. The
   * armoury owns the key while it is open, so Escape closes it rather than
   * Enter skipping past a half-made choice.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && armoury) {
        event.preventDefault();
        setArmoury(false);
        return;
      }
      if (event.key !== "Enter" || armoury) return;
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement) {
        return;
      }
      event.preventDefault();
      begin();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armoury, begin]);

  const onAvatarChange = (next: AvatarChoice) => {
    void saveAvatar(next);
  };

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col gap-4 px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-jade text-4xl tracking-[0.2em]">ZEN MODE</h1>
          <p className="text-paper-dim mt-2 text-sm">
            Calculus, one question at a time, for as long as you want.
          </p>
        </div>

        {/* Someone who has been here before gets their standing back, not the
            pitch they already read. */}
        {ready && returning && (
          <dl className="text-label flex items-end gap-6 tracking-widest">
            <Stat label="RANK" value={rank.current.name} tone="text-indigo" />
            <Stat label="XP" value={profile.totalXp} tone="text-jade" />
            <Stat label="BEST STREAK" value={profile.bestStreak} tone="text-paper" />
          </dl>
        )}
      </div>

      {/* The hall takes every pixel the header and the panel below do not. */}
      <Dojo
        mood="idle"
        combo={0}
        avatar={profile.avatar}
        rankId={rank.current.id}
      />

      {armoury ? (
        <section className="pixel-frame bg-ink-soft shrink-0 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-gold text-lg tracking-widest">ARMOURY</h2>
            <p className="text-paper-dim text-label tracking-widest">
              RANK UP TO UNLOCK · ESC TO CLOSE
            </p>
          </div>

          <AvatarPicker
            choice={profile.avatar}
            currentRankId={rank.current.id}
            onChange={onAvatarChange}
          />

          <button
            type="button"
            onClick={() => setArmoury(false)}
            className="focus-ring pixel-frame text-paper mt-5 bg-ink px-4 py-2 text-xs tracking-widest hover:border-gold"
          >
            DONE
          </button>
        </section>
      ) : (
        <section className="pixel-frame bg-ink-soft shrink-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <h2 className="text-gold text-2xl tracking-widest">CALCULUS</h2>
                <span className="text-paper-dim text-label tracking-widest">
                  {POOL.length} QUESTIONS
                </span>
              </div>
              <p className="text-paper-dim mt-2 text-sm">{SUBTOPICS.join(" · ")}</p>
            </div>

            {/* The primary action, as an actual button with a verb on it. The
                whole card used to be one unlabelled link and nothing on the
                page said how to start. */}
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setArmoury(true)}
                className="focus-ring pixel-frame text-paper-dim bg-ink px-4 py-3 text-xs tracking-widest hover:border-gold hover:text-paper"
              >
                ARMOURY
              </button>
              <button
                type="button"
                onClick={begin}
                autoFocus
                className="focus-ring pixel-frame-hot text-jade bg-ink px-6 py-3 text-base tracking-[0.2em] hover:bg-ink-soft"
              >
                {returning ? "CONTINUE ▸" : "BEGIN ▸"}
              </button>
            </div>
          </div>

          <div className="border-ink-line mt-5 flex items-end gap-2 border-t pt-4">
            {TIERS.map((count, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-paper-dim text-label tabular-nums">{count}</span>
                {/*
                  Height carries the count. These were five identical squares
                  separated only by opacity between 0.65 and 0.95, which on a
                  dark ground is no difference at all — a bar chart that did
                  not vary with its data.
                */}
                <span
                  className="bg-jade-deep w-6"
                  style={{ height: `${8 + (count / MAX_TIER_COUNT) * 28}px` }}
                />
                <span className="text-paper-dim text-label tracking-widest">
                  T{i + 1}
                </span>
              </div>
            ))}

            <p className="text-paper-dim text-label ml-auto self-center tracking-widest">
              ENTER BEGINS · ENTER SUBMITS · SHIFT+ENTER WHEN STUCK · ESC ENDS
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
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
      <dt className="text-paper-dim">{label}</dt>
      <dd className={`${tone} text-lg leading-none tabular-nums`}>{value}</dd>
    </div>
  );
}
