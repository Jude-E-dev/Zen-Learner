"use client";

/**
 * Shown after two consecutive unreadable submissions.
 *
 * This is deliberately NOT the tutor. Someone typing `2x^` repeatedly is stuck
 * on the keyboard, not on calculus, and sending a maths tutor at a typing
 * problem wastes their pause quota and answers a question they didn't ask.
 */
export function NotationHelp({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="anim-quiet pixel-frame-warn bg-ink-soft p-5">
      <h2 className="text-gold mb-1 text-xs tracking-title">HOW TO TYPE IT</h2>
      <p className="text-paper-dim mb-4 text-xs">
        Nothing scored, nothing lost. This one is on the keyboard, not on you.
      </p>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Row want="x squared" type="x^2" />
        <Row want="a fraction" type="(1-x^2)/(x^2+1)" />
        <Row want="multiply" type="2*x  or  2x" />
        <Row want="square root" type="sqrt(x)" />
        <Row want="natural log" type="ln(x)  or  log(x)" />
        <Row want="e to the x" type="e^x" />
        <Row want="trig" type="sin(x), cos(x), tan(x)" />
        <Row want="constant of integration" type="+ C  (optional)" />
      </dl>

      <p className="text-paper-dim mt-4 text-xs">
        LaTeX works too, if that is what your fingers know:{" "}
        <code className="text-paper">\frac{"{1}{2}"}</code>,{" "}
        <code className="text-paper">x^{"{2}"}</code>.
      </p>

      <button
        type="button"
        onClick={onDismiss}
        className="focus-ring btn-secondary mt-5"
      >
        GOT IT
      </button>
    </section>
  );
}

function Row({ want, type }: { want: string; type: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-line pb-1">
      <dt className="text-paper-dim text-xs">{want}</dt>
      <dd className="text-jade">{type}</dd>
    </div>
  );
}
