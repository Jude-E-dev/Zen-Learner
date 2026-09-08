import Link from "next/link";
import questionData from "@/lib/content/generated.json";
import type { Question } from "@/lib/content/schema";

const POOL = questionData as unknown as Question[];

export default function TopicSelect() {
  const subtopics = [...new Set(POOL.map((q) => q.subtopic))].sort();
  const tiers = [1, 2, 3, 4, 5].map(
    (t) => POOL.filter((q) => q.tier === t).length,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-5 py-16">
      <div>
        <h1 className="text-jade text-4xl tracking-[0.2em]">ZEN MODE</h1>
        <p className="text-paper-dim mt-3 leading-relaxed">
          A practice hall. Questions come one at a time, forever, with no clock
          running. Get three right at a tier and you move up. Get stuck and the
          grind quiets down while you work it out.
        </p>
      </div>

      <Link
        href="/play"
        className="pixel-frame-hot bg-ink-soft block p-6 transition-colors hover:bg-ink"
      >
        <div className="flex items-baseline justify-between">
          <span className="text-gold text-2xl tracking-widest">CALCULUS</span>
          <span className="text-paper-dim text-xs tracking-widest">
            {POOL.length} QUESTIONS
          </span>
        </div>
        <p className="text-paper-dim mt-3 text-sm">{subtopics.join(" · ")}</p>
        <div className="mt-5 flex items-center gap-2">
          {tiers.map((count, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-paper-dim text-label">T{i + 1}</span>
              <span
                className={`h-8 w-6 border-2 border-ink-line ${
                  count > 0 ? "bg-jade-deep" : "bg-ink"
                }`}
                style={{ opacity: count > 0 ? 0.35 + Math.min(count, 6) * 0.1 : 1 }}
              />
              <span className="text-paper-dim text-label tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </Link>

      <p className="text-paper-dim text-label leading-relaxed tracking-widest">
        KEYBOARD ONLY · ENTER SUBMITS · SHIFT+ENTER WHEN STUCK · ESC ENDS
      </p>
    </main>
  );
}
