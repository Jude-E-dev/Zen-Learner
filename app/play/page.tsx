"use client";

import { useEffect, useRef, useState } from "react";
import questionData from "@/lib/content/generated.json";
import type { Question } from "@/lib/content/schema";
import { Hud } from "@/components/Hud";
import { MathText } from "@/components/MathText";
import { NotationHelp } from "@/components/NotationHelp";
import { PausePanel } from "@/components/PausePanel";
import { SummaryCard } from "@/components/SummaryCard";
import {
  advanceHint,
  dismissNotationHelp,
  endSession,
  invokePause,
  resumeFromPause,
  startSession,
  submitAnswer,
  type SessionState,
} from "@/lib/game/session";
import { rankFor } from "@/lib/game/ranks";
import { useProfile } from "@/lib/persistence/useProfile";
import { masteryWithSession, downloadJsonl } from "@/lib/persistence/profile";

const POOL = questionData as unknown as Question[];

/**
 * Keyboard-first by construction. A learner should get through thirty questions
 * without reaching for the mouse:
 *
 *   Enter        submit, then advance
 *   Shift+Enter  I'm stuck (enter the pause)
 *   Escape       end the session and see the card
 *
 * Inside the pause, Enter on an empty box takes the next rung; typing an answer
 * and pressing Enter leaves the pause and grades it.
 */
export default function PlayPage() {
  const [state, setState] = useState<SessionState>(() => startSession(POOL));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile, durable, commitSession, exportEvents } = useProfile();
  const committed = useRef<SessionState | null>(null);

  // Focus follows the loop, so typing always lands somewhere useful.
  useEffect(() => {
    if (state.phase !== "summary") inputRef.current?.focus();
  }, [state.phase, state.current?.id]);

  // Persist once, when the session actually ends.
  useEffect(() => {
    if (state.phase !== "summary" || committed.current === state) return;
    committed.current = state;
    void commitSession(state);
  }, [state, commitSession]);

  // Rank is derived from lifetime mastery plus what has happened this session,
  // so climbing a rank happens the moment it is earned rather than at the end.
  const rank = rankFor(masteryWithSession(profile.mastery, state));

  function grade(from: SessionState, answer: string) {
    const before = from.lastAward?.seq ?? 0;
    const graded = submitAnswer(from, answer, POOL);
    setState(graded);
    // A correct answer has already advanced the stream; clear the box for the
    // question that is now on screen. A wrong one keeps the text so it can be
    // edited rather than retyped.
    if ((graded.lastAward?.seq ?? 0) > before) setInput("");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const answer = input;
    const empty = answer.trim() === "";

    // Inside the pause an empty Enter walks the ladder; a real answer leaves it.
    if (state.phase === "paused" || state.phase === "revealed") {
      if (empty) {
        setState(state.phase === "paused" ? advanceHint(state) : resumeFromPause(state));
        return;
      }
      grade(resumeFromPause(state), answer);
      return;
    }

    if (empty) return;
    grade(state, answer);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (state.phase === "grinding") {
        setState(invokePause(state, state.pauseOffered ? "offered" : "manual"));
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setState(endSession(state));
    }
  }

  if (state.phase === "summary") {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-5 py-10">
        <SummaryCard
          state={state}
          rank={rank}
          // The card is shown either side of the commit that increments this,
          // so clamp rather than offset: 0 before, the real count after.
          sessionNumber={Math.max(1, profile.sessions)}
          onRestart={() => {
            setState(startSession(POOL));
            setInput("");
          }}
        />
        {process.env.NODE_ENV === "development" && (
          <button
            type="button"
            onClick={() => void exportEvents().then(downloadJsonl)}
            className="text-paper-dim mx-auto text-[10px] tracking-widest hover:text-paper"
          >
            EXPORT EVENTS (.JSONL)
          </button>
        )}
      </main>
    );
  }

  const q = state.current;
  if (!q) return null;

  const result = state.lastResult;
  const showMiss = result?.verdict === "incorrect";
  const showUnreadable = result?.verdict === "unreadable";
  const inPause = state.phase === "paused" || state.phase === "revealed";

  return (
    <main
      className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-8"
      onKeyDown={handleKeyDown}
    >
      <Hud state={state} rank={rank} />

      {!durable && (
        <p className="pixel-frame border-gold/50 bg-ink-soft text-gold px-4 py-2 text-xs">
          Storage is blocked in this browser, so progress won&apos;t be saved after
          you close the tab. Everything else works normally.
        </p>
      )}

      <section
        className={`pixel-frame bg-ink-soft relative p-7 ${showMiss ? "anim-miss" : ""}`}
      >
        <div className="text-paper-dim mb-4 flex items-center gap-3 text-[10px] tracking-widest">
          <span>TIER {q.tier}</span>
          <span className="text-ink-line">|</span>
          <span className="uppercase">{q.subtopic}</span>
        </div>

        <MathText text={q.prompt} className="block text-xl leading-relaxed" />

        {/* The hit lands over the transition. Keyed on the award sequence so
            each correct answer replays it, including a repeat of the same XP. */}
        {state.lastAward && (
          <span
            key={state.lastAward.seq}
            aria-hidden
            className="anim-hit text-jade pointer-events-none absolute right-7 top-6 text-3xl font-bold tabular-nums"
          >
            +{state.lastAward.xp}
          </span>
        )}
      </section>

      {state.showNotationHelp && (
        <NotationHelp onDismiss={() => setState(dismissNotationHelp(state))} />
      )}

      {inPause && <PausePanel state={state} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <input
          id="answer"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={inPause ? "Answer, or Enter alone to go on" : "Your answer"}
          className="pixel-frame text-paper bg-ink px-4 py-3 text-lg outline-none placeholder:text-paper-dim/60 focus:border-jade-deep"
        />

        <div aria-live="polite" className="min-h-[1.5rem] text-sm">
          {showMiss && (
            <span className="text-blood">
              Not quite.{" "}
              <span className="text-paper-dim">
                {state.pauseOffered
                  ? "Try again, or Shift+Enter and we'll work through it."
                  : "Have another go."}
              </span>
            </span>
          )}
          {showUnreadable && (
            <span className="text-gold">
              I couldn&apos;t read that.{" "}
              <span className="text-paper-dim">
                Nothing scored — check the notation and try again.
              </span>
            </span>
          )}
        </div>

        <p className="text-paper-dim border-t-2 border-ink-line pt-3 text-[10px] tracking-widest">
          ENTER SUBMIT · SHIFT+ENTER I&apos;M STUCK · ESC END SESSION
        </p>
      </form>
    </main>
  );
}
