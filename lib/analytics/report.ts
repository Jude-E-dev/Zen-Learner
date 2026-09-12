import type { GameEvent } from "../game/events";

/**
 * The two questions this whole event stream exists to answer (design doc #7):
 *
 *   1. Does the pause actually unstick people?
 *   2. Does the loop survive its own novelty?
 *
 * Everything below serves one of those. The analysis is kept here, away from
 * the script that prints it, because the interesting part is the arithmetic
 * and the arithmetic is where it is easy to quietly flatter yourself.
 *
 * The honest limitation, stated in the report itself rather than buried here:
 * with a single builder as the only user these are n=1 and describe *your*
 * practice, not a population.
 */

export interface Row {
  session: number;
  event: GameEvent;
}

export interface SessionSummary {
  session: number;
  answered: number;
  correct: number;
  unreadable: number;
  xp: number;
  /** Wall clock from session_start to session_end. Null if either is missing. */
  durationMs: number | null;
  /** Median time on an attempt, pause time excluded. Null if nothing answered. */
  medianLatencyMs: number | null;
  pauses: number;
}

export interface RetryRates {
  /** Retries that came after a pause. */
  afterPause: { attempts: number; correct: number };
  /** Retries on a question already got wrong, with no pause in between. */
  unaided: { attempts: number; correct: number };
}

/**
 * How the tutor layer actually behaved.
 *
 * Fallback rate is the headline quality metric (design doc #12): it is the
 * fraction of tutored turns that ended on the authored ladder instead. The
 * reasons are kept apart because they call for opposite responses — `leak`
 * means the prompt needs work, `provider-error` and `timeout` mean the network
 * does, and `quota` means the limit is set too low for how people actually
 * play. Collapsed into one number, none of that is visible.
 */
export interface TutorReport {
  /** Turns where the tutor was asked at all. */
  attempted: number;
  replied: number;
  /** Replies whose first draft leaked and whose retry stood in. */
  retried: number;
  fellBack: number;
  byReason: Record<string, number>;
}

export interface PauseReport {
  invoked: number;
  /** Pauses where the learner then attempted the question again. */
  resolved: number;
  /** Pauses abandoned without another attempt in that session. */
  abandoned: number;
  retries: RetryRates;
  /** How deep the ladder was walked, rung -> count. */
  rungsReached: Record<number, number>;
  solutionsRevealed: number;
  medianPauseMs: number | null;
  /** Attempts whose afterPause flag disagreed with the serving's own history. */
  flagMismatches: number;
}

export interface RetentionReport {
  sessions: number;
  /** Questions answered, in session order. The novelty curve, as a series. */
  lengths: number[];
  first: SessionSummary | null;
  fifth: SessionSummary | null;
  latest: SessionSummary | null;
}

export interface AnalyticsReport {
  rows: number;
  skipped: number;
  sessions: SessionSummary[];
  pause: PauseReport;
  tutor: TutorReport;
  retention: RetentionReport;
  notes: string[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * Parse one exported JSONL line. The export is a file on disk that a person
 * can edit, so a bad line is skipped and counted rather than allowed to abort
 * a report over the other few thousand good ones.
 */
export function parseRow(line: string): Row | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.session !== "number") return null;
  if (typeof candidate.type !== "string") return null;
  if (typeof candidate.ts !== "number") return null;

  const { session, ...event } = candidate;
  return { session, event: event as unknown as GameEvent };
}

export function parseJsonl(text: string): { rows: Row[]; skipped: number } {
  const rows: Row[] = [];
  let skipped = 0;

  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const row = parseRow(line);
    if (row) rows.push(row);
    else skipped += 1;
  }

  return { rows, skipped };
}

function summariseSession(session: number, events: GameEvent[]): SessionSummary {
  const start = events.find((e) => e.type === "session_start");
  const end = events.find((e) => e.type === "session_end");

  const answers = events.filter((e) => e.type === "answer_submitted");
  const latencies = answers.map((e) => e.latencyMs).filter((ms) => Number.isFinite(ms));

  return {
    session,
    answered: answers.length,
    correct: answers.filter((e) => e.verdict === "correct").length,
    unreadable: events.filter((e) => e.type === "unreadable_input").length,
    xp: end?.type === "session_end" ? end.xp : 0,
    durationMs: start && end ? end.ts - start.ts : null,
    medianLatencyMs: median(latencies),
    pauses: events.filter((e) => e.type === "pause_invoked").length,
  };
}

/**
 * Hypothesis one, done honestly.
 *
 * "Attempts after a pause are 70% correct" means nothing on its own — a second
 * attempt at a question you have already seen is easier whether or not anyone
 * helped. The comparison that carries information is against the *unaided
 * retry*: the learner got it wrong, did not pause, and tried again. Both arms
 * are the same situation, differing only in whether the ladder was walked.
 *
 * The unit is a **serving**, not a question. The same question can come round
 * again later in a session, and the app's own `afterPause` flag resets when a
 * new question is served — so tracking "has this question been paused on"
 * across a whole session credits the ladder for help it did not give. That is
 * what `question_served` is for: it delimits the servings, and everything is
 * scoped inside one.
 */
interface Serving {
  questionId: string;
  paused: boolean;
  attempts: { correct: boolean; afterPause: boolean }[];
}

function servingsIn(events: GameEvent[]): Serving[] {
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const servings: Serving[] = [];
  let current: Serving | null = null;

  for (const event of ordered) {
    switch (event.type) {
      case "question_served":
        current = { questionId: event.questionId, paused: false, attempts: [] };
        servings.push(current);
        break;

      case "pause_invoked":
        if (current?.questionId === event.questionId) current.paused = true;
        break;

      case "answer_submitted":
        if (current?.questionId === event.questionId) {
          current.attempts.push({
            correct: event.verdict === "correct",
            afterPause: event.afterPause,
          });
        }
        break;

      default:
        break;
    }
  }

  return servings;
}

function analyseTutor(bySession: Map<number, GameEvent[]>): TutorReport {
  const byReason: Record<string, number> = {};
  let replied = 0;
  let retried = 0;
  let fellBack = 0;

  for (const events of bySession.values()) {
    for (const event of events) {
      if (event.type === "tutor_replied") {
        replied += 1;
        if (event.retried) retried += 1;
      }
      if (event.type === "tutor_fallback") {
        fellBack += 1;
        byReason[event.reason] = (byReason[event.reason] ?? 0) + 1;
      }
    }
  }

  return { attempted: replied + fellBack, replied, retried, fellBack, byReason };
}

function analysePauses(bySession: Map<number, GameEvent[]>): PauseReport {
  const retries: RetryRates = {
    afterPause: { attempts: 0, correct: 0 },
    unaided: { attempts: 0, correct: 0 },
  };

  const rungsReached: Record<number, number> = {};
  const pauseDurations: number[] = [];
  let invoked = 0;
  let resolved = 0;
  let solutionsRevealed = 0;
  let flagMismatches = 0;

  for (const events of bySession.values()) {
    for (const event of events) {
      if (event.type === "pause_invoked") invoked += 1;
      if (event.type === "solution_revealed") solutionsRevealed += 1;
      if (event.type === "pause_ended") {
        if (Number.isFinite(event.durationMs)) pauseDurations.push(event.durationMs);
        rungsReached[event.reachedRung] = (rungsReached[event.reachedRung] ?? 0) + 1;
      }
    }

    for (const serving of servingsIn(events)) {
      // A pause the learner walked away from without trying again.
      if (serving.paused && serving.attempts.some((a) => a.afterPause)) resolved += 1;

      serving.attempts.forEach((attempt, index) => {
        if (attempt.afterPause !== (serving.paused && attempt.afterPause)) flagMismatches += 1;
        // Only retries are comparable. A first attempt has no arm.
        if (index === 0) return;
        const arm = attempt.afterPause ? retries.afterPause : retries.unaided;
        arm.attempts += 1;
        if (attempt.correct) arm.correct += 1;
      });
    }
  }

  return {
    invoked,
    resolved,
    abandoned: invoked - resolved,
    retries,
    rungsReached,
    solutionsRevealed,
    medianPauseMs: median(pauseDurations),
    flagMismatches,
  };
}

export function buildReport(rows: Row[], skipped = 0): AnalyticsReport {
  const bySession = new Map<number, GameEvent[]>();
  for (const { session, event } of rows) {
    const list = bySession.get(session) ?? [];
    list.push(event);
    bySession.set(session, list);
  }

  const sessions = [...bySession.entries()]
    .sort(([a], [b]) => a - b)
    .map(([session, events]) => summariseSession(session, events));

  const pause = analysePauses(bySession);
  const tutor = analyseTutor(bySession);

  const retention: RetentionReport = {
    sessions: sessions.length,
    lengths: sessions.map((s) => s.answered),
    first: sessions.find((s) => s.session === 1) ?? sessions[0] ?? null,
    fifth: sessions.find((s) => s.session === 5) ?? null,
    latest: sessions[sessions.length - 1] ?? null,
  };

  const notes: string[] = [];
  if (sessions.length === 0) notes.push("No sessions in this export.");
  if (sessions.length > 0 && sessions.length < 5) {
    notes.push(
      `Only ${sessions.length} session(s) recorded — the novelty question needs 5 to answer as posed.`,
    );
  }
  /*
   * The event store rotates, keeping only the most recent sessions, so an
   * export from a long-lived profile can simply not contain session 1. Worth
   * saying: `retention.first` falls back to the earliest session present, and a
   * reader would otherwise take that for the learner's first ever run.
   */
  if (retention.first && retention.first.session !== 1) {
    notes.push(
      `Session 1 is not in this export — the earliest kept is session ${retention.first.session}, so "first" means earliest still stored, not first ever.`,
    );
  }
  if (pause.retries.afterPause.attempts < 10) {
    notes.push(
      `Only ${pause.retries.afterPause.attempts} post-pause retries — too few to read the rate as anything but a hint.`,
    );
  }
  if (pause.retries.unaided.attempts === 0) {
    notes.push("No unaided retries to compare against, so the pause rate has no baseline.");
  }
  if (skipped > 0) notes.push(`${skipped} unparseable line(s) skipped.`);
  if (pause.flagMismatches > 0) {
    notes.push(
      `${pause.flagMismatches} attempt(s) had an afterPause flag the event stream does not support — the app and this script disagree.`,
    );
  }

  /*
   * A fallback rate this high means the tutor is not doing its job, whatever
   * the reason. Worth saying out loud in the report rather than leaving to be
   * noticed in a ratio.
   */
  if (tutor.attempted >= 10 && tutor.fellBack / tutor.attempted > 0.2) {
    const reasons = Object.entries(tutor.byReason)
      .sort(([, a], [, b]) => b - a)
      .map(([reason, count]) => `${reason} ${count}`)
      .join(", ");
    notes.push(
      `${Math.round((tutor.fellBack / tutor.attempted) * 100)}% of tutored turns fell back to the authored ladder (${reasons}).`,
    );
  }
  if (tutor.attempted === 0 && pause.invoked > 0) {
    notes.push("Pauses were invoked but the tutor was never asked — running without a key.");
  }

  return { rows: rows.length, skipped, sessions, pause, tutor, retention, notes };
}

export function rate(part: { attempts: number; correct: number }): number | null {
  return part.attempts === 0 ? null : part.correct / part.attempts;
}
