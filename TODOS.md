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

## Customisable ronin avatar — and the coins that buy it

**What:** An on-screen ronin the learner customises with what they earn. This is one feature
with the coin economy, not two: the avatar is the sink coins were missing.

**Why:** Coins were cut during the eng review for having nothing to spend them on. A currency
with no sink is worse than no currency, because it visibly does nothing. The avatar resolves
that directly, and it also gives the screen a character to sit with during a long grind — a
practice hall with somebody in it, rather than a form.

**Pros:** Turns XP and coins into a visible, accumulating identity, which is exactly the kind of
long-horizon payoff the design doc says pure numbers-going-up cannot supply. It also makes the
summary card far more shareable: a card with *your* ronin on it is a different object from a
card with a percentage on it, and sharing is the only distribution channel this thing has.

**Cons:** Real art scope. The plan forbids third-party sprite packs with unclear licensing, so
every piece is CSS/SVG-drawn or commissioned. Cosmetics also need persistence and a shop
surface, both of which are new UI.

**Context:** Design it as: coins awarded alongside XP (scaled by tier, reduced after a pause,
same as XP), a small catalogue of swappable parts (blade, kasa, haori, banner), and equipped
state persisted next to progress in IndexedDB. Keep it strictly cosmetic — the moment a
purchase affects difficulty or hints, the mastery gate stops meaning anything. Two open
questions to settle first: does the avatar appear during the grind or only on the summary card,
and is it earned by coins alone or gated on rank (which would give ranks a second job).

**Depends on:** Stage 4 (progression + persistence) landing first, since cosmetics need
somewhere durable to live. Best built after the loop is proven fun, not before.

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
