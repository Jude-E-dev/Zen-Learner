"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SummaryCard } from "@/components/SummaryCard";
import { decodeSummary, SUMMARY_PARAM } from "@/lib/summary/permalink";

/**
 * Somebody else's session, rendered from the link they sent.
 *
 * There is no server-side store, so everything on this page came out of the
 * query string — which means it is arbitrary input that anyone can edit. The
 * decoder returns null for anything it cannot read and this page renders a
 * dead end with a way into the app, rather than crashing on a shape it did not
 * expect (design doc, eng review issue 6).
 *
 * Nothing here is written to the visitor's profile. A link is something to
 * look at, not a way to award yourself a rank.
 */
export default function SharedSummaryPage() {
  return (
    <Suspense fallback={<Frame>{null}</Frame>}>
      <SharedSummary />
    </Suspense>
  );
}

function SharedSummary() {
  const summary = decodeSummary(useSearchParams().get(SUMMARY_PARAM));

  if (!summary) return <BrokenLink />;

  return (
    <Frame>
      {/* A link can encode a session with nothing answered, and the card no
          longer claims 0% for one, so neither does this. */}
      <h1 className="sr-only">
        A Zen Mode session shared with you — session {summary.sessionNumber},{" "}
        {summary.answered === 0
          ? "nothing answered"
          : `${summary.accuracy}% accuracy`}{" "}
        at rank {summary.rankName}
      </h1>

      <SummaryCard
        summary={summary}
        actions={
          <div className="flex flex-col items-center gap-3">
            <p className="text-paper-dim text-label tracking-label">
              SOMEBODY ELSE&apos;S SESSION
            </p>
            <Link
              href="/"
              className="focus-ring btn-primary"
            >
              TRY IT YOURSELF ▸
            </Link>
          </div>
        }
      />
    </Frame>
  );
}

function BrokenLink() {
  return (
    <Frame>
      <div className="pixel-frame bg-ink-soft flex w-full max-w-[420px] flex-col gap-4 p-7">
        <p className="font-bitmap text-jade text-label tracking-wordmark">ZEN MODE</p>

        <h1 className="font-bitmap text-gold text-2xl leading-tight tracking-label">
          This summary link is broken
        </h1>

        <p className="text-paper-dim text-sm leading-relaxed">
          The card travels inside the link itself, so a link that got cut short
          on its way here — chat clients love to do that — has nothing left to
          show. Nothing is wrong on your end, and there is no page it was
          supposed to reach.
        </p>

        <p className="text-paper-dim text-sm leading-relaxed">
          Ask whoever sent it for the whole thing, or start your own.
        </p>

        <Link
          href="/"
          className="focus-ring btn-primary mt-2 self-start"
        >
          ENTER THE HALL ▸
        </Link>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-6 px-5 py-10">
      {children}
    </main>
  );
}
