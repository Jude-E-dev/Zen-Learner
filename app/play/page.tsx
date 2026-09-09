"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { drillFor, type Drill } from "@/lib/content/drills";
import { Hud } from "@/components/Hud";
import { MathText } from "@/components/MathText";
import { NotationHelp } from "@/components/NotationHelp";
import { PausePanel } from "@/components/PausePanel";
import { SummaryCard } from "@/components/SummaryCard";
import { Banner, type BannerMessage } from "@/components/Banner";
import { Dojo, type DojoMood } from "@/components/Dojo";
import { RankBar } from "@/components/RankBar";
import {
  advanceHint,
  dismissNotationHelp,
  endSession,
  invokePause,
  recordEvent,
  resumeFromPause,
  startSession,
  submitAnswer,
  type SessionState,
} from "@/lib/game/session";
import { useTutor } from "@/lib/tutor/useTutor";
import { remainingPauses, hasQuota } from "@/lib/tutor/quota";
import { rankFor } from "@/lib/game/ranks";
import { useProfile } from "@/lib/persistence/useProfile";
import { ArmouryPanel } from "@/components/ArmouryPanel";
import { summaryFromSession } from "@/lib/summary/summary";
import { summaryUrl } from "@/lib/summary/permalink";
import type { AvatarChoice } from "@/lib/game/avatar";
import type { Question } from "@/lib/content/schema";
import { masteryWithSession, downloadJsonl } from "@/lib/persistence/profile";

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
  return (
    <Suspense fallback={null}>
      <Play />
    </Suspense>
  );
}

function Play() {
  const drill = drillFor(useSearchParams().get("drill"));
  /*
   * The pool is built once per mount and kept. Mental math generates its bank
   * from a seed, so rebuilding it on every render would reshuffle the drill
   * underneath the learner mid-session.
   */
  const [pool] = useState<Question[]>(() => drill.pool());
  const [state, setState] = useState<SessionState>(() => startSession(pool));
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile, durable, commitSession, saveAvatar, spendTutorPause, exportEvents } =
    useProfile();
  const tutor = useTutor();
  /*
   * The mistake the tutor is answering.
   *
   * invokePause clears lastResult — the pause is not a verdict screen — so the
   * wrong answer and the misconception it matched have to be caught on the way
   * past, while they still exist.
   */
  const lastMistake = useRef<{ answer: string; misconceptionId?: string }>({
    answer: "",
  });
  /*
   * Whether the pause currently open paid for a tutor.
   *
   * The quota gate fires once, on the way in, so rungs 2 and 3 have no gate of
   * their own — without this they would happily call the model inside a pause
   * that was denied one, which is the quota leaking by the back door.
   */
  const pauseTutored = useRef(false);
  const committed = useRef<SessionState | null>(null);
  const router = useRouter();
  /*
   * The armoury opens over the session rather than replacing it. Changing kit
   * mid-grind is a cosmetic act, so it must not cost a streak, and the ronin
   * being right there is what makes the preview worth anything.
   */
  const [armoury, setArmoury] = useState(false);
  const [copied, setCopied] = useState(false);

  // Focus follows the loop, so typing always lands somewhere useful. The
  // tutor's status is a dependency because a disabled input drops focus, and
  // without this the learner would have to click back into the box every time
  // a reply landed.
  useEffect(() => {
    if (state.phase !== "summary" && !armoury && tutor.status !== "thinking") {
      inputRef.current?.focus();
    }
  }, [state.phase, state.current?.id, armoury, tutor.status]);

  // Persist once, when the session actually ends.
  useEffect(() => {
    if (state.phase !== "summary" || committed.current === state) return;
    committed.current = state;
    void commitSession(state);
  }, [state, commitSession]);

  // Rank is derived from lifetime mastery plus what has happened this session,
  // so climbing a rank happens the moment it is earned rather than at the end.
  const rank = rankFor(masteryWithSession(profile.mastery, state));

  // Watch for the moments worth announcing. Refs rather than state so noticing
  // a change never itself causes a render.
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const seenRank = useRef<string | null>(null);
  const seenTier = useRef<number | null>(null);
  const seenCap = useRef(false);
  const bannerSeq = useRef(0);

  // One effect, not three. A single answer can promote a tier AND earn a rank
  // at the same time, and separate effects would race — the last one to run
  // would silently overwrite the bigger moment. Rank always wins.
  useEffect(() => {
    const previousRank = seenRank.current;
    const previousTier = seenTier.current;
    const previousCap = seenCap.current;
    const tier = state.selector.tier;

    seenRank.current = rank.current.id;
    seenTier.current = tier;
    seenCap.current = state.selector.atCap;

    // First observation is just arriving, not an event worth announcing.
    if (previousRank === null || previousTier === null) return;

    const announce = (message: Omit<BannerMessage, "seq">) => {
      bannerSeq.current += 1;
      setBanner({ ...message, seq: bannerSeq.current });
    };

    if (previousRank !== rank.current.id) {
      announce({
        kind: "rank-up",
        title: rank.current.name,
        detail: rank.current.blurb,
      });
      return;
    }

    if (previousTier !== tier) {
      const up = tier > previousTier;
      announce({
        kind: up ? "tier-up" : "tier-down",
        title: `TIER ${tier}`,
        detail: up ? "Harder questions from here." : "Easing off. Nothing lost.",
      });
      return;
    }

    if (!previousCap && state.selector.atCap) {
      announce({
        kind: "at-cap",
        title: "TIER 5",
        detail: "Nowhere left to climb. Hold it here.",
      });
    }
  }, [
    rank.current.id,
    rank.current.name,
    rank.current.blurb,
    state.selector.tier,
    state.selector.atCap,
  ]);

  // The room reacts. A landed strike and a miss are both brief, so they live as
  // transient moods rather than derived state.
  const [mood, setMood] = useState<DojoMood>("idle");

  /*
   * The damage number is an event, not a fact about the session.
   *
   * It used to read straight off state.lastAward, which holds the last award
   * *ever made this session* and is never cleared. Any remount then replayed
   * the punch with a stale number — closing the armoury or stepping out of the
   * hint ladder both showed a phantom "+30" that added nothing to the total,
   * because nothing had been awarded. Holding it here, and clearing it when it
   * is done, means the number exists exactly as long as the event it reports.
   */
  const [award, setAward] = useState<SessionState["lastAward"]>(null);

  /*
   * The clock, for drills that are about speed.
   *
   * Ticking display state only — the authoritative latency is measured in
   * session.ts from attemptStartedAt, so a dropped frame or a backgrounded tab
   * cannot inflate what gets scored or logged.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!drill.timed || state.phase !== "grinding") return;
    setElapsed(Date.now() - state.attemptStartedAt);
    const tick = setInterval(() => {
      setElapsed(Date.now() - state.attemptStartedAt);
    }, 100);
    return () => clearInterval(tick);
  }, [drill.timed, state.phase, state.attemptStartedAt]);

  useEffect(() => {
    if (!state.lastAward) return;
    setMood("strike");
    setAward(state.lastAward);

    /*
     * Reduced motion gets longer, not shorter. With the flight animation cut
     * there is no movement to catch the eye, so the number has to hold long
     * enough to be read from a standing start.
     */
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    const moodTimer = setTimeout(() => setMood("idle"), 480);
    const awardTimer = setTimeout(() => setAward(null), reduced ? 1600 : 700);
    return () => {
      clearTimeout(moodTimer);
      clearTimeout(awardTimer);
    };
  }, [state.lastAward?.seq]);

  useEffect(() => {
    if (state.lastResult?.verdict !== "incorrect") return;
    setMood("miss");
    const timer = setTimeout(() => setMood("idle"), 260);
    return () => clearTimeout(timer);
  }, [state.lastResult]);

  /**
   * Ask the tutor for one rung, and resolve it however it resolves.
   *
   * The quota counts *pauses*, not requests. One pause is up to three rungs
   * and therefore up to three requests, all of them paid for by the single
   * unit spent on the way in — which is why the gate is only consulted at
   * rung 1. Charging per rung would turn a five-pause allowance into
   * something closer to one and a half.
   *
   * It is spent before the request rather than after it: a reply that arrives
   * costs the same as one that times out, and counting only useful answers
   * would let an unlucky session run past its budget indefinitely. Everything
   * that is not a tutored reply lands on the authored rung, so this always
   * ends with something on screen.
   */
  async function askTutor(next: SessionState, rung: number) {
    const question = next.current;
    if (!question) return;
    const authoredHint = question.hints[rung - 1];
    // A pause always opens on rung 1, so this is exactly "entering a pause".
    const entering = rung === 1;

    if (entering) pauseTutored.current = hasQuota(profile.pauseQuota);

    if (!pauseTutored.current) {
      tutor.showAuthored(authoredHint, "quota");
      setState(
        recordEvent(next, {
          type: "tutor_fallback",
          ts: Date.now(),
          questionId: question.id,
          rung,
          reason: "quota",
        }),
      );
      return;
    }

    /*
     * A pause that opened without quota never gets here, and one that opened
     * with it has already paid — so later rungs ask without spending again.
     */
    if (entering) void spendTutorPause();
    const turn = await tutor.ask({
      question,
      rung,
      wrongAnswer: lastMistake.current.answer,
      misconceptionId: lastMistake.current.misconceptionId,
      authoredHint,
    });

    // Log against the state this rung belongs to, not whatever the learner has
    // done since — the ordering is what makes "did the pause unstick them"
    // readable in the log.
    setState((current) =>
      recordEvent(
        current,
        turn.authored
          ? {
              type: "tutor_fallback",
              ts: Date.now(),
              questionId: question.id,
              rung,
              reason: turn.reason ?? "provider-error",
            }
          : {
              type: "tutor_replied",
              ts: Date.now(),
              questionId: question.id,
              rung,
              retried: turn.retried ?? false,
            },
      ),
    );
  }

  function grade(from: SessionState, answer: string) {
    const before = from.lastAward?.seq ?? 0;
    const graded = submitAnswer(from, answer, pool);
    if (graded.lastResult?.verdict === "incorrect") {
      lastMistake.current = {
        answer,
        misconceptionId: graded.lastResult.misconceptionId,
      };
    }
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

    // A request in flight owns the box. Submitting again would spend a second
    // pause on the same rung and race two replies into the same slot.
    if (tutor.status === "thinking") return;

    // Inside the pause an empty Enter walks the ladder; a real answer leaves it.
    if (state.phase === "paused" || state.phase === "revealed") {
      if (empty) {
        if (state.phase !== "paused") {
          tutor.reset();
          setState(resumeFromPause(state));
          return;
        }
        const walked = advanceHint(state);
        setState(walked);
        // The reveal is authored prose, not a tutored turn — nothing to ask.
        if (walked.phase === "paused") void askTutor(walked, walked.hintRung);
        else tutor.reset();
        return;
      }
      tutor.reset();
      grade(resumeFromPause(state), answer);
      return;
    }

    if (empty) return;
    grade(state, answer);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    /*
     * While the armoury is open it owns both keys: Escape closes it rather
     * than ending the session, and Enter must not submit an answer the
     * learner cannot currently see.
     */
    if (armoury) {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        if (event.key === "Escape") setArmoury(false);
      }
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (state.phase === "grinding" && tutor.status !== "thinking") {
        const paused = invokePause(state, state.pauseOffered ? "offered" : "manual");
        setState(paused);
        void askTutor(paused, paused.hintRung);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      tutor.reset();
      setState(endSession(state));
    }
  }

  if (state.phase === "summary") {
    const summary = summaryFromSession(
      state,
      rank.current.id,
      // The card is shown either side of the commit that increments this, so
      // clamp rather than offset: 0 before, the real count after.
      Math.max(1, profile.sessions),
      profile.avatar,
      drill.id,
      drill.timed,
    );

    async function share() {
      const url = summaryUrl(summary, window.location.origin);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      } catch {
        // Clipboard access can be refused outright (insecure origin, denied
        // permission). Putting the link in the URL bar still leaves the
        // learner something they can copy by hand, which beats a dead button.
        window.location.href = url;
      }
    }

    return (
      <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-5 py-10">
        <SummaryCard
          summary={summary}
          actions={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setState(startSession(pool));
                  setInput("");
                }}
                autoFocus
                className="focus-ring pixel-frame-hot text-jade bg-ink px-5 py-2 text-xs tracking-[0.2em] hover:bg-ink-soft"
              >
                GO AGAIN
              </button>

              <button
                type="button"
                onClick={() => void share()}
                className="focus-ring pixel-frame text-paper-dim bg-ink px-5 py-2 text-xs tracking-[0.2em] hover:border-gold hover:text-paper"
              >
                {copied ? "LINK COPIED" : "COPY SHARE LINK"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/")}
                className="focus-ring pixel-frame text-paper-dim bg-ink px-5 py-2 text-xs tracking-[0.2em] hover:border-gold hover:text-paper"
              >
                ◂ BACK TO THE HALL
              </button>
            </div>
          }
        />
        {process.env.NODE_ENV === "development" && (
          <button
            type="button"
            onClick={() => void exportEvents().then(downloadJsonl)}
            className="focus-ring text-paper-dim mx-auto text-label tracking-widest hover:text-paper"
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
  // The armoury and the hint ladder both take the room's space and both want
  // the scene quiet behind them.
  const panelOpen = armoury || inPause;

  return (
    <main
      className="mx-auto flex h-dvh max-w-5xl flex-col gap-4 px-5 py-5"
      onKeyDown={handleKeyDown}
    >
      {/*
        The screen a learner spends the whole session on had no heading at all,
        so assistive tech announced the route with no name. It is visually
        hidden rather than drawn, because the HUD already says all of this to
        anyone who can see it and a second title would be chrome.
      */}
      <h1 className="sr-only">
        Zen Mode {drill.name.toLowerCase()} — tier {q.tier}, rank{" "}
        {rank.current.name}
      </h1>

      <Banner message={banner} />

      <Hud state={state} rank={rank} />
      <RankBar rank={rank} />

      {!durable && (
        <p className="pixel-frame border-gold/50 bg-ink-soft text-gold px-4 py-2 text-xs">
          Storage is blocked in this browser, so progress won&apos;t be saved after
          you close the tab. Everything else works normally.
        </p>
      )}

      <section
        className={`pixel-frame bg-ink-soft shrink-0 p-6 ${showMiss ? "anim-miss" : ""}`}
      >
        <div className="text-paper-dim mb-3 flex items-center gap-3 text-label tracking-widest">
          <span>TIER {q.tier}</span>
          <span className="text-ink-line">|</span>
          <span className="uppercase">{q.subtopic}</span>
        </div>

        <div className="flex items-end justify-between gap-4">
          {/*
            Bigger on a timed drill, but never in the display face. Silkscreen
            is for headings; a drill whose whole point is reading a number
            correctly under pressure needs the clearest glyphs available, and
            mistaking a 9 for an 8 because the type is decorative is a real
            failure rather than a cosmetic one. Tabular figures so the prompt
            does not reflow as digits change.
          */}
          <MathText
            text={q.prompt}
            className={`block leading-relaxed ${
              drill.timed ? "text-4xl tabular-nums" : "text-xl"
            }`}
          />

          {/*
            The clock is the whole point of a speed drill, so it is on the
            question rather than tucked into the HUD. Tabular figures so the
            digits do not jitter as they climb.
          */}
          {drill.timed && (
            <span
              aria-hidden
              className={`shrink-0 tabular-nums text-2xl leading-none ${
                elapsed < 5000 ? "text-jade" : elapsed < 12000 ? "text-gold" : "text-paper-dim"
              }`}
            >
              {(elapsed / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </section>

      {/* The room fills whatever is left. When the pause opens it shrinks to a
          strip and dims, so the world stays present while the ladder gets the
          space — the grind quieting down, rather than being replaced. */}
      <div className="flex min-h-0 grow flex-col gap-4">
        {state.showNotationHelp && (
          <NotationHelp onDismiss={() => setState(dismissNotationHelp(state))} />
        )}

        {/*
          One Dojo, always in the same place, with the panels sliding in beneath
          it. Three conditional copies meant every panel toggle unmounted the
          scene and mounted a fresh one, which replayed the damage number and
          restarted the idle breath from frame zero. The hall keeps a strip
          while a panel is open: dressing the ronin, or working through a hint,
          with the ronin off-screen loses the thing being talked about.
        */}
        <Dojo
          mood={armoury ? "idle" : inPause ? "quiet" : mood}
          combo={panelOpen ? 0 : state.streak}
          award={panelOpen ? null : award}
          avatar={profile.avatar}
          rankId={rank.current.id}
          className={
            armoury ? "h-28 shrink-0" : inPause ? "h-20 shrink-0" : "grow"
          }
        />

        {panelOpen && (
          <div className="min-h-0 grow overflow-y-auto">
            {armoury ? (
              <ArmouryPanel
                choice={profile.avatar}
                currentRankId={rank.current.id}
                onChange={(next: AvatarChoice) => void saveAvatar(next)}
                onClose={() => setArmoury(false)}
                note="ESC TO CLOSE · YOUR STREAK IS SAFE"
              />
            ) : (
              <PausePanel
                state={state}
                turn={tutor.turn}
                status={tutor.status}
                remaining={remainingPauses(profile.pauseQuota)}
              />
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-2">
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
          /*
            Locked while the tutor is being asked (design doc, latency
            treatment): a double-submit would spend twice and count twice
            against a five-a-day quota for one question. Disabled rather than
            readonly, so the cursor and the styling both say so.
          */
          disabled={tutor.status === "thinking"}
          placeholder={
            tutor.status === "thinking"
              ? "…"
              : inPause
                ? "Answer, or Enter alone to go on"
                : "Your answer"
          }
          className="focus-ring pixel-frame text-paper bg-ink px-4 py-3 text-lg placeholder:text-paper-mute focus:border-jade-deep disabled:opacity-50"
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

        {/*
          The way out, and the way to the armoury, on the screen that had
          neither. The play flow contained no navigation at all: once a session
          started, the browser's back button was the only exit.
        */}
        <div className="border-ink-line flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-2 pt-3">
          <p className="text-paper-dim text-label tracking-widest">
            ENTER SUBMIT · SHIFT+ENTER I&apos;M STUCK · ESC END SESSION
          </p>

          <button
            type="button"
            onClick={() => setArmoury(true)}
            className="focus-ring text-paper-dim text-label tracking-widest hover:text-gold"
          >
            ARMOURY
          </button>
        </div>
      </form>
    </main>
  );
}
