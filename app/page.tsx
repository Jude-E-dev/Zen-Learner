"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DRILLS, type Drill } from "@/lib/content/drills";
import { Dojo } from "@/components/Dojo";
import { ArmouryPanel } from "@/components/ArmouryPanel";
import { useProfile } from "@/lib/persistence/useProfile";
import { rankFor } from "@/lib/game/ranks";
import type { AvatarChoice } from "@/lib/game/avatar";


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

  const [chosen, setChosen] = useState<Drill>(DRILLS[0]);

  const begin = useCallback(
    (drill: Drill = chosen) => {
      router.push(`/play?drill=${drill.id}`);
    },
    [router, chosen],
  );

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
    <main className="mx-auto flex h-dvh max-w-5xl flex-col gap-4 overflow-y-auto px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-bitmap text-jade text-4xl tracking-[0.2em]">ZEN MODE</h1>
          <p className="text-paper-dim mt-2 text-sm">
            Two drills. Take the calculus slowly, or take the arithmetic fast.
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
        <ArmouryPanel
          choice={profile.avatar}
          currentRankId={rank.current.id}
          onChange={onAvatarChange}
          onClose={() => setArmoury(false)}
        />
      ) : (
        <section className="pixel-frame bg-ink-soft shrink-0 p-5">
          {/*
            One row per drill. They are different in kind, not just in subject:
            the calculus bank is thirty authored questions with no clock, and
            mental math is generated and timed. The card says which is which
            rather than making them look interchangeable.
          */}
          <div className="flex flex-col gap-3">
            {DRILLS.map((drill) => {
              const active = drill.id === chosen.id;
              return (
                <div
                  key={drill.id}
                  /*
                    Stacked below `sm`, a row above it.

                    As a row at every width it was a row at 375px too, and the
                    action group is `shrink-0` while the text column is
                    `flex-1 min-w-0` — so the button kept its 150px and the
                    text was handed the 89px left over. Both blurbs rendered
                    at eleven characters a line, six and seven lines deep,
                    against a 45-75 target; the subtopic list ran fourteen
                    lines. The column that shrinks is the one carrying the
                    prose.
                  */
                  className={`flex flex-col items-stretch gap-4 border-2 p-4 transition-colors sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-3 ${
                    active ? "border-jade-deep bg-ink" : "border-ink-line"
                  }`}
                >
                  {/*
                    `flex-1` so this column absorbs the slack and shrinks,
                    rather than sizing to its content and pushing the action
                    group onto a second line.

                    Without it the row wrapped whenever the subtopic list ran
                    long, and `justify-between` then left-aligned the wrapped
                    line. Calculus has ten subtopics and wrapped; mental math
                    has six and did not — so the two BEGIN buttons, the two
                    most important actions on the page, sat 622px apart with
                    nothing but the length of a metadata list deciding it.
                  */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <h2 className="font-bitmap text-gold text-xl tracking-widest">
                        {drill.name}
                      </h2>
                      <span className="text-paper-dim text-label tracking-widest">
                        {drill.size === null ? "ENDLESS" : `${drill.size} QUESTIONS`}
                      </span>
                      {drill.timed && (
                        <span className="text-jade text-label tracking-widest">TIMED</span>
                      )}
                    </div>
                    <p className="text-paper-dim mt-1 text-sm">{drill.blurb}</p>
                    <p className="text-paper-mute mt-1 text-label tracking-wide">
                      {drill.subtopics.join(" · ")}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {drill.tierCounts && <TierBars counts={drill.tierCounts} />}
                    <button
                      type="button"
                      onClick={() => begin(drill)}
                      onFocus={() => setChosen(drill)}
                      onMouseEnter={() => setChosen(drill)}
                      autoFocus={active}
                      /* Full width while the row is stacked, so the primary
                         action is the full-width thing it is everywhere else
                         on a phone rather than a 150px tab floating left. */
                      className="focus-ring pixel-frame-hot text-jade bg-ink w-full px-6 py-3 text-base tracking-[0.2em] hover:bg-ink-soft sm:w-auto"
                    >
                      {returning ? "CONTINUE ▸" : "BEGIN ▸"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-ink-line mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t pt-4">
            <button
              type="button"
              onClick={() => setArmoury(true)}
              className="focus-ring pixel-frame text-paper-dim bg-ink px-4 py-2 text-xs tracking-widest hover:border-gold hover:text-paper"
            >
              ARMOURY
            </button>
            <p className="text-paper-dim text-label tracking-widest">
              ENTER STARTS THE HIGHLIGHTED DRILL · SHIFT+ENTER WHEN STUCK · ESC ENDS
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

/** The authored bank has a real shape per tier. Height carries the count. */
function TierBars({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  return (
    <div className="hidden items-end gap-1.5 sm:flex">
      {counts.map((count, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span className="text-paper-dim text-label tabular-nums">{count}</span>
          <span
            className="bg-jade-deep w-5"
            style={{ height: `${8 + (count / max) * 24}px` }}
          />
          <span className="text-paper-dim text-label tracking-widest">T{i + 1}</span>
        </div>
      ))}
    </div>
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
