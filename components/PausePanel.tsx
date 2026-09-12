"use client";

import { MathText } from "./MathText";
import { MAX_HINT_RUNG, type SessionState } from "@/lib/game/session";
import type { TutorStatus, TutorTurn } from "@/lib/tutor/useTutor";

/**
 * The Socratic pause.
 *
 * There is an authored ladder underneath all of this and the product does not
 * need an AI to work: the ladder is human-written, exactly three rungs, and
 * the reveal is the authored worked solution. The tutor layer only rephrases
 * the current rung against the learner's specific mistake — when it is off,
 * unreachable, or out of quota, what remains is the ladder, and it has to be
 * good on its own.
 *
 * That is why the tutored reply and the authored rung occupy the same slot
 * rather than sitting in a separate "AI" box. A learner should not have to
 * notice which one they got.
 */

/** Why the ladder is standing in, in words a learner can act on. */
const FALLBACK_NOTE: Record<string, string> = {
  quota: "That's your five tutored pauses for today. The ladder still works.",
  timeout: "The tutor took too long, so here's the authored hint.",
  leak: "The tutor nearly gave it away, so here's the authored hint.",
  "provider-error": "The tutor is unreachable, so here's the authored hint.",
  // Not an error and not worth explaining: this is simply the app without a
  // key, which is a supported way to run it.
  "not-configured": "",
};

export function PausePanel({
  state,
  turn,
  status,
  remaining,
}: {
  state: SessionState;
  turn: TutorTurn | null;
  status: TutorStatus;
  /** Tutored pauses left today, for the footer. */
  remaining: number;
}) {
  const q = state.current;
  if (!q) return null;

  const revealed = state.phase === "revealed";
  const thinking = status === "thinking";
  const note = turn?.authored ? (FALLBACK_NOTE[turn.reason ?? ""] ?? "") : "";

  return (
    <section className="anim-quiet pixel-frame-hot bg-ink-soft p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-jade text-xs tracking-title">
          {revealed ? "THE WHOLE PATH" : "PAUSED"}
        </h2>
        {!revealed && (
          <span className="text-paper-dim text-label tracking-label">
            RUNG {state.hintRung} / {MAX_HINT_RUNG}
          </span>
        )}
      </div>

      {revealed ? (
        <ol className="flex flex-col gap-3">
          {q.workedSolution.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-rung shrink-0 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1">
                <MathText text={step.step} className="text-paper leading-relaxed" />
                {step.result && (
                  <code className="text-gold text-sm">= {step.result}</code>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Only rungs already reached, so the ladder can't be skipped ahead. */}
          {q.hints.slice(0, state.hintRung - 1).map((hint, i) => (
            <div key={i} className="text-paper-mute flex gap-3">
              <span className="text-rung shrink-0 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <MathText text={hint} className="leading-relaxed" />
            </div>
          ))}

          {/*
            The current rung: the tutor's words when it managed them, the
            authored ones otherwise. While the request is in flight the row
            holds its space and says so, so the panel does not jump when the
            reply lands.
          */}
          {/*
            The live region is the row, not the message inside it.
            `aria-live` used to sit on the "reading what you wrote" paragraph,
            which exists only while the request is in flight — so the region
            was mounted with its content and then unmounted, and a screen
            reader announced neither the wait nor the reply that replaced it.
            Marking the row means the swap is a mutation inside a region that
            was already there, which is the thing that actually gets read out.
          */}
          <div className="flex gap-3" aria-live="polite">
            <span className="text-rung shrink-0 tabular-nums">
              {String(state.hintRung).padStart(2, "0")}
            </span>
            {thinking ? (
              <p className="text-paper-dim anim-quiet leading-relaxed">
                The tutor is reading what you wrote…
              </p>
            ) : (
              <MathText
                text={turn?.text ?? q.hints[state.hintRung - 1]}
                className="leading-relaxed"
              />
            )}
          </div>

          {note && !thinking && (
            <p className="text-paper-dim border-ink-line border-l-2 pl-3 text-xs leading-relaxed">
              {note}
            </p>
          )}
        </div>
      )}

      <div className="text-paper-dim mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-ink-line pt-3 text-xs leading-relaxed">
        <p>
          {revealed
            ? "Enter on an empty box to try it again — a correct answer still counts."
            : thinking
              ? "One moment."
              : state.hintRung >= MAX_HINT_RUNG
                ? "Type an answer and press Enter, or press Enter on an empty box to see the whole solution."
                : "Type an answer and press Enter, or press Enter on an empty box for the next nudge."}
        </p>

        {/*
          The quota is shown while it still means something. Counting down from
          five on the first pause of the day would read as a limit being
          imposed; showing the last two reads as a heads-up.
        */}
        {!revealed && remaining <= 2 && (
          <span className="text-label tracking-label">
            {remaining === 0
              ? "AUTHORED HINTS ONLY TODAY"
              : `${remaining} TUTORED ${remaining === 1 ? "PAUSE" : "PAUSES"} LEFT TODAY`}
          </span>
        )}
      </div>
    </section>
  );
}
