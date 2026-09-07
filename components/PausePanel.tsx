"use client";

import { MathText } from "./MathText";
import { MAX_HINT_RUNG, type SessionState } from "@/lib/game/session";

/**
 * The Socratic pause, authored-ladder version.
 *
 * There is no AI here and the product does not need one to work: the ladder is
 * human-written, exactly three rungs, and the reveal is the authored worked
 * solution. The AI layer that lands later only rephrases a rung against the
 * learner's specific mistake — if it is switched off, this is what remains, and
 * it has to be good on its own.
 */
export function PausePanel({ state }: { state: SessionState }) {
  const q = state.current;
  if (!q) return null;

  const revealed = state.phase === "revealed";

  return (
    <section className="anim-quiet pixel-frame-hot bg-ink-soft p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-jade text-xs tracking-[0.2em]">
          {revealed ? "THE WHOLE PATH" : "PAUSED"}
        </h2>
        {!revealed && (
          <span className="text-paper-dim text-[10px] tracking-widest">
            RUNG {state.hintRung} / {MAX_HINT_RUNG}
          </span>
        )}
      </div>

      {revealed ? (
        <ol className="flex flex-col gap-3">
          {q.workedSolution.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-jade-deep shrink-0 tabular-nums">
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
          {q.hints.slice(0, state.hintRung).map((hint, i) => (
            <div
              key={i}
              className={`flex gap-3 ${i === state.hintRung - 1 ? "" : "opacity-45"}`}
            >
              <span className="text-jade-deep shrink-0 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <MathText text={hint} className="leading-relaxed" />
            </div>
          ))}
        </div>
      )}

      <p className="text-paper-dim mt-5 border-t-2 border-ink-line pt-3 text-xs leading-relaxed">
        {revealed
          ? "Enter on an empty box to try it again — a correct answer still counts."
          : state.hintRung >= MAX_HINT_RUNG
            ? "Type an answer and press Enter, or press Enter on an empty box to see the whole solution."
            : "Type an answer and press Enter, or press Enter on an empty box for the next nudge."}
      </p>
    </section>
  );
}
