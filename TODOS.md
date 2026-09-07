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

## Revisit coins and audio (cut from the vertical slice)

**What:** Reconsider the coin currency and the ambient audio layer, both cut during the eng review.

**Why:** Coins were cut because no sink was specced — there is nothing to spend them on, making
them a dead currency that still costs HUD, persistence, and award-logic work. Audio was cut
because it ships muted by default and answers neither instrumentation hypothesis. Neither is a
bad idea; both are premature before the loop is proven.

**Pros:** A coin economy with an actual sink (cosmetic unlocks, hint purchases) gives the grind a
second reward axis; audio is a large part of the 16-bit feel the project is going for.

**Cons:** Coins are only worth building alongside a sink, which is its own scope. Audio needs
asset sourcing under a clean licence, which the plan explicitly constrains.

**Context:** Re-add coins only together with something to spend them on — a currency with no sink
is worse than no currency, because it visibly does nothing. For audio, the original build prompt
asks for one ambient loop plus a small SFX set, muted by default, toggleable, and remembered.

**Depends on:** The core loop being proven fun (the session-1 vs session-5 measurement).
