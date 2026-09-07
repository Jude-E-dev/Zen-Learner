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
  nextQuestion,
  resumeFromPause,
  startSession,
  submitAnswer,
  xpFor,
  type SessionState,
} from "@/lib/game/session";

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
  const [hitId, setHitId] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus follows the loop, so typing always lands somewhere useful.
  useEffect(() => {
    if (state.phase !== "summary") inputRef.current?.focus();
  }, [state.phase, state.current?.id]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const answer = input;
    const empty = answer.trim() === "";

    // Feedback: Enter moves the stream along.
    if (state.phase === "feedback") {
      setState(nextQuestion(state, POOL));
      setInput("");
      return;
    }

    // Inside the pause an empty Enter walks the ladder; a real answer leaves it.
    if (state.phase === "paused" || state.phase === "revealed") {
      if (empty) {
        setState(state.phase === "paused" ? advanceHint(state) : resumeFromPause(state));
        return;
      }
      const graded = submitAnswer(resumeFromPause(state), answer, POOL);
      setState(graded);
      if (graded.lastResult?.verdict === "correct") {
        setInput("");
        setHitId((n) => n + 1);
      }
      return;
    }

    if (empty) return;

    const graded = submitAnswer(state, answer, POOL);
    setState(graded);
    // Keep a wrong answer in the box so it can be edited rather than retyped.
    if (graded.lastResult?.verdict === "correct") {
      setInput("");
      setHitId((n) => n + 1);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (state.phase === "grinding" || state.phase === "feedback") {
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
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-10">
        <SummaryCard state={state} onRestart={() => {
          setState(startSession(POOL));
          setInput("");
        }} />
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
      <Hud state={state} />

      <section
        className={`pixel-frame bg-ink-soft relative p-7 ${showMiss ? "anim-miss" : ""}`}
      >
        <div className="text-paper-dim mb-4 flex items-center gap-3 text-[10px] tracking-widest">
          <span>TIER {q.tier}</span>
          <span className="text-ink-line">|</span>
          <span className="uppercase">{q.subtopic}</span>
        </div>

        <MathText text={q.prompt} className="block text-xl leading-relaxed" />

        {/* The damage number. Keyed so a repeat correct answer replays it. */}
        {state.phase === "feedback" && (
          <span
            key={hitId}
            aria-hidden
            className="anim-hit text-jade pointer-events-none absolute right-7 top-6 text-3xl font-bold tabular-nums"
          >
            +{xpFor(q.tier, state.usedPauseOnCurrent)}
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
          placeholder={
            state.phase === "feedback"
              ? "Enter for the next one"
              : inPause
                ? "Answer, or Enter alone to go on"
                : "Your answer"
          }
          className={`pixel-frame bg-ink px-4 py-3 text-lg outline-none placeholder:text-paper-dim/60 focus:border-jade-deep ${
            state.phase === "feedback" ? "text-paper-dim" : "text-paper"
          }`}
        />

        <div aria-live="polite" className="min-h-[1.5rem] text-sm">
          {state.phase === "feedback" && (
            <span className="text-jade">
              Correct{state.usedPauseOnCurrent ? " — and you got there yourself." : "."}{" "}
              <span className="text-paper-dim">Enter for the next one.</span>
            </span>
          )}
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
