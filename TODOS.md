# TODOS

Deferred work with enough context to pick up cold. Added by `/plan-eng-review` on 2026-09-07.

---

## Cap or rotate the analytics event store

**What:** Add a size cap or rotation policy to the IndexedDB analytics event store.

**Why:** The eng review settled on buffering every event in IndexedDB with a dev-only export to
`.jsonl`. Nothing ever removes them, so the store grows for the life of the browser profile —
every question latency, every pause, every session, forever. Exports get slower over time, and
the store eventually competes with actual progress data for the origin's storage quota.

**Pros:** Bounded storage, fast exports, and no risk of a browser eviction event taking progress
data with it (eviction is origin-wide — it does not spare the progress records).

**Cons:** Rotation means older sessions age out, which is awkward for a session-1 vs session-5
comparison if the retention window is set too small.

**Context:** The stack is IndexedDB-only with no server store, so this data has nowhere else to
live. A ring buffer keeping the last N sessions (50 is a reasonable default) or an
export-then-prune flow both solve it. The trigger to act: export times becoming noticeable, or
the browser surfacing a storage warning.

**Depends on:** Stage 4 (persistence layer) existing first.

---

## Re-add linear algebra, including its equivalence-checker work

**What:** Restore the linear algebra topic (~30 more questions) after the calculus slice proves
out — and budget for the checker work it requires, which is larger than it looks.

**Why:** Linear algebra was cut from the vertical slice for authoring cost and per-tier question
density, not because it doesn't belong. It is half of the original stated practice need. The cut
obscured a real cost: linear algebra is where answer-equivalence checking gets genuinely hard,
and none of that work exists in the current plan.

**Pros:** Restores the full practice scope originally wanted, and by then the loop is proven, so
the authoring effort goes into something known to work.

**Cons:** The checker work is closer to a second checker than an extension of the first:
- Matrix answers need dimension-aware comparison, not scalar sampling.
- Eigenvalue answers are sets — order must not affect correctness.
- Null-space and eigenspace bases are non-unique, so two correct answers can look completely
  different and both be right (requires span/row-equivalence comparison, not value comparison).

**Context:** The current checker (mathjs parse + domain-safe numeric sampling, with
differentiation for antiderivatives) handles scalar and symbolic expressions in one variable.
None of those techniques transfer to matrices, sets, or basis equivalence. Knowing this before
assuming "linalg is just 30 more questions" is the point of this entry.

**Depends on:** The calculus slice shipping, and the two instrumentation hypotheses being
answered first.

---

## Coins — the half of the avatar feature that is still missing

**Status:** The avatar shipped on 2026-09-08 via `/design-review`. This entry is what is left.

**What shipped:** Three customisable slots (hat, robe, obi), five options each, rendered live on
the home page and carried into the practice hall. Persisted in IndexedDB as profile version 2.
Unlocks are gated on **rank**, not coins.

**Why rank and not coins:** The design review put the avatar on the home page because the page
had dead space and nothing to grow into — the figure was needed there regardless. That made the
avatar available before the currency meant to gate it existed, and a shop with imaginary money
in it is worse than no shop. Ranks are already earned and already mean something, so the reward
for holding tier 3 is that you get to look like someone who holds tier 3.

**What is left:** Coins awarded alongside XP (scaled by tier, reduced after a pause, same as XP),
and a decision about what they buy now that rank already gates the cosmetics. The obvious
answer is that the two gate different things: rank unlocks the *palette* tiers, coins buy
*parts* (blade, kasa shape, banner) that rank does not touch. Settle that before building the
wallet, or coins end up duplicating a gate that already works.

**Still true from the original entry:** Keep it strictly cosmetic. The moment a purchase affects
difficulty or hints, the mastery gate stops meaning anything. No third-party sprite packs; the
existing parts are all drawn as character-grid pixel maps in `components/Dojo.tsx`, and the
palette plumbing to extend them is in `lib/game/avatar.ts`.

**Answered by the shipped work:** The avatar appears during the grind, not only on the summary
card. The summary card still shows a percentage rather than your ronin — putting it there is a
small, worthwhile follow-up, since sharing is this project's only distribution channel.

---

## Design polish deferred from the 2026-09-08 review

Two of the four are done. Full report in
`~/.gstack/projects/Zen_Learner/designs/design-audit-20260908/`.

- ~~**The play route has no `<h1>`.**~~ Done 2026-09-08. Both the play route
  and a shared summary now carry a visually hidden heading.
- ~~**No pixel typeface.**~~ Done 2026-09-08. Silkscreen (OFL, self-hosted via
  `next/font`) on the display layer only; body copy, the answer input and
  anything KaTeX touches stay monospace.
- **The hall grows a tall ceiling on narrow viewports.** The scene is 3:1 and
  anchors to the bottom of its container, so on mobile the room gets a large
  empty upper half. It paints the wall colour so it reads as a high ceiling
  rather than a seam, but the ronin ends up small and low.
  `preserveAspectRatio="slice"` would fill it and is a no-op at desktop's exact
  3:1, but starts cropping the training post below roughly a 1.75:1 container —
  too fragile to take without art made for it.
- **Reduced motion is verified by source, not by observation.** All ten
  animation classes are in the `prefers-reduced-motion` block in
  `app/globals.css`, but the headless browser used for the review could not
  emulate the preference, so nobody has watched the app with it on.

---

## Revisit the audio layer (cut from the vertical slice)

**What:** One ambient loop plus a small SFX set, muted by default, toggleable, and remembered.

**Why:** Cut during the eng review because it ships muted by default and answers neither
instrumentation hypothesis. Not a bad idea, just not one that earns its place before the loop
is proven.

**Pros:** A large part of the 16-bit feel the project is going for; the hit and miss cues would
carry real weight alongside the existing visual feedback.

**Cons:** Needs asset sourcing under a clean licence, which the plan explicitly constrains.

**Context:** The build prompt asks for the toggle state to be remembered, so this wants the
persistence layer in place. Respect `prefers-reduced-motion` neighbours here too — an audio
equivalent (`prefers-reduced-motion` does not cover sound, so a first-run default of muted is
doing that job).

**Depends on:** The core loop being proven fun (the session-1 vs session-5 measurement).
