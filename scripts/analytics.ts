/**
 * Stage 8: the script that answers the two hypotheses.
 *
 *   pnpm analytics zen-events.jsonl
 *
 * Reads the JSONL the dev-only export produces (a browser cannot append to a
 * file on disk, so events buffer in IndexedDB and leave through that button)
 * and prints the two numbers the whole event stream exists for.
 *
 * It is deliberately blunt about what it cannot tell you. With a single
 * builder as the only user every measurement here is n=1: it describes your
 * practice, not a population, and the report says so on every run rather than
 * in a footnote nobody reads.
 *
 * Imports are relative because this runs under tsx, which does not resolve the
 * @/ path alias.
 */

import { readFileSync } from "node:fs";
import { buildReport, parseJsonl, rate, type AnalyticsReport } from "../lib/analytics/report";

const BAR_WIDTH = 24;

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function secs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function bar(value: number, max: number): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(value > 0 ? 1 : 0, Math.round((value / max) * BAR_WIDTH)));
}

function heading(text: string): void {
  console.log(`\n${text}`);
  console.log("─".repeat(text.length));
}

function report(data: AnalyticsReport): void {
  console.log(`\nZEN MODE — ${data.rows} events across ${data.sessions.length} session(s)`);

  heading("HYPOTHESIS 1 — does the pause unstick people?");

  const aided = rate(data.pause.retries.afterPause);
  const unaided = rate(data.pause.retries.unaided);

  console.log(
    `  After a pause     ${pct(aided).padStart(4)}  ` +
      `(${data.pause.retries.afterPause.correct}/${data.pause.retries.afterPause.attempts} retries correct)`,
  );
  console.log(
    `  Unaided retry     ${pct(unaided).padStart(4)}  ` +
      `(${data.pause.retries.unaided.correct}/${data.pause.retries.unaided.attempts} retries correct)`,
  );

  if (aided !== null && unaided !== null) {
    const delta = aided - unaided;
    const sign = delta >= 0 ? "+" : "";
    console.log(`\n  Difference        ${sign}${Math.round(delta * 100)} points`);
    console.log(
      delta > 0.05
        ? "  The ladder is doing something a second look alone does not."
        : delta < -0.05
          ? "  Pausing is doing WORSE than just trying again. Look at the hints."
          : "  No real difference. The pause is not earning its complexity yet.",
    );
  } else {
    console.log("\n  Not enough of both arms to compare. Play more, or pause more.");
  }

  console.log(
    `\n  Pauses ${data.pause.invoked} · returned to the question ${data.pause.resolved} · ` +
      `walked away ${data.pause.abandoned} · median ${secs(data.pause.medianPauseMs)}`,
  );

  const rungs = Object.entries(data.pause.rungsReached).sort(([a], [b]) => Number(a) - Number(b));
  if (rungs.length > 0) {
    const max = Math.max(...rungs.map(([, count]) => count));
    console.log("\n  How far down the ladder:");
    for (const [rung, count] of rungs) {
      console.log(`    rung ${rung}  ${String(count).padStart(3)}  ${bar(count, max)}`);
    }
    console.log(`    solution revealed ${data.pause.solutionsRevealed}×`);
  }

  /*
   * Not a hypothesis — a health check. The tutor is a feature, not the
   * product, so this reports whether it worked rather than whether it helped;
   * whether it helped is hypothesis 1 above, and the ladder answers that
   * whether or not a model was involved.
   */
  if (data.tutor.attempted > 0) {
    const pct = (n: number) => `${Math.round((n / data.tutor.attempted) * 100)}%`;
    console.log(
      `\n  Tutor asked ${data.tutor.attempted}× · replied ${data.tutor.replied} (${pct(data.tutor.replied)}) · ` +
        `fell back ${data.tutor.fellBack} (${pct(data.tutor.fellBack)})`,
    );
    if (data.tutor.retried > 0) {
      console.log(
        `    ${data.tutor.retried} repl${data.tutor.retried === 1 ? "y" : "ies"} needed the temperature-0 retry first`,
      );
    }
    const reasons = Object.entries(data.tutor.byReason).sort(([, a], [, b]) => b - a);
    if (reasons.length > 0) {
      const max = Math.max(...reasons.map(([, count]) => count));
      console.log("    why it fell back:");
      for (const [reason, count] of reasons) {
        console.log(`      ${reason.padEnd(16)}${String(count).padStart(3)}  ${bar(count, max)}`);
      }
    }
  }

  heading("HYPOTHESIS 2 — does the loop survive its own novelty?");

  if (data.sessions.length === 0) {
    console.log("  Nothing to measure.");
  } else {
    const max = Math.max(...data.sessions.map((s) => s.answered), 1);
    console.log("  session  answered  correct  median      length");
    for (const s of data.sessions) {
      console.log(
        `  ${String(s.session).padStart(7)}  ${String(s.answered).padStart(8)}  ` +
          `${pct(s.answered === 0 ? null : s.correct / s.answered).padStart(7)}  ` +
          `${secs(s.medianLatencyMs).padStart(6)}  ${secs(s.durationMs).padStart(8)}  ` +
          bar(s.answered, max),
      );
    }

    const { first, fifth } = data.retention;
    if (first && fifth) {
      const delta = fifth.answered - first.answered;
      const sign = delta >= 0 ? "+" : "";
      console.log(
        `\n  Session 1 → 5     ${first.answered} → ${fifth.answered} questions (${sign}${delta})`,
      );
      console.log(
        delta > 0
          ? "  Still going, and going for longer. The loop survived the novelty."
          : delta === 0
            ? "  Holding steady. Not decay, not growth."
            : "  Shorter than the first run. That is the novelty wearing off.",
      );
    }
  }

  if (data.notes.length > 0) {
    heading("WHAT THIS CANNOT TELL YOU");
    for (const note of data.notes) console.log(`  · ${note}`);
  }

  console.log(
    "\n  n=1. This is one person's practice, measured by the person whose\n" +
      "  practice it is. Treat every number above as a hint, not a finding.\n",
  );
}

function main(): void {
  const path = process.argv[2];

  if (!path) {
    console.error(
      "usage: pnpm analytics <events.jsonl>\n\n" +
        "Get the file from the app: finish a session, then EXPORT EVENTS (.JSONL)\n" +
        "on the summary screen. That button only appears in development.",
    );
    process.exit(1);
  }

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error(`Cannot read ${path}.`);
    process.exit(1);
  }

  const { rows, skipped } = parseJsonl(text);
  report(buildReport(rows, skipped));
}

main();
