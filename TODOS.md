# TODOS

Deferred work with enough context to pick up cold. Added by `/plan-eng-review` on 2026-09-07.

---

## Mental math drill — shipped 2026-09-08

A second drill: fast mental arithmetic (54 − 17, 21 × 11), timed. Reached from the home
page, or directly at `/play?drill=mental-math`.

**How it fits:** the questions are generated (`lib/content/mental.ts`) rather than
authored, because the point is a stream that never repeats. Everything downstream —
tier selection, ranks, mastery, the dojo, the permalink — consumes `Question[]` and did
not need to change; `lib/content/drills.ts` is the only place that knows the two drills
differ.

**Speed is deliberately not worth XP.** Ranks are gated on demonstrated accuracy at a
tier and never on volume (design doc constraint #5). Paying XP for speed would hand back
exactly the grind that gate exists to prevent: rush the easy tier, bank the bonus. Speed
gets its own feedback instead — a clock while you answer, and fastest/typical times on
the summary card.

**The safety net:** generated content never touches `pnpm validate:content`, so
`lib/content/mental.test.ts` stands in for it — 28 tests over a wide sample checking that
every answer is the arithmetic it claims, every distractor is genuinely wrong, every tier
is reachable, and no hint is degenerate. That last group exists because the first version
shipped hints like "you are 0 above it. Add 0 then 0." — arithmetically true, useless,
and invisible to every correctness test. Do not delete that block.

**Still open:**
- The home page tagline and the calculus card both used to promise "no clock running".
  The promise now lives on the calculus card only, where it is still true. Worth a second
  look if a third drill lands.
- No per-question time target, so "fast" is measured only against your own previous
  times. A target-time band per tier would make the clock mean something on question one.
- Tier 5 tops out around `41 × 25`. If that stops being a stretch, the ceiling needs
  raising rather than the range widening.

## Tutor layer (stage 5) — shipped and verified 2026-09-09

The constrained tutor: `/api/tutor`, the leak validator, the daily quota, the eval
suite, and the pause UI that consumes them. Run against the live model; the numbers
below are measured, not projected.

**How it fits:** the authored ladder was already load-bearing and stays that way. The
tutor rewrites the *current* rung against the mistake just made, and every failure path
— no key, no quota, a leak, a timeout, a provider error — resolves to that same authored
rung in the same slot. `PausePanel` has no "AI" box; a learner should not have to notice
which one they got. Pulling `ANTHROPIC_API_KEY` out leaves the app fully playable.

**Eval results** (22 fixtures, `pnpm eval:tutor`, ~$0.017 a run):

| | leak | shape | rung | addresses | clean |
|---|---|---|---|---|---|
| first run | 9 | 2 | 2 | 6 | 8/22 |
| after fixes | 0 | 2 | 3 | 3 | 14/22 |

`--save=f.json` keeps the replies and `--replay=f.json` re-checks them for free. Use it:
the replies are the expensive half and they do not change when a check does, so tuning
the validator against a saved run costs nothing and holds the model fixed while the
checker moves — which is the only way to tell a real fix from a lucky sample.

**What the live run found that no amount of unit testing would have:**

- **The rung-3 branch described a turn the app never takes.** `buildUserMessage` handed
  the model the entire worked solution at rung 3 and asked it to walk through it. But
  `advanceHint` moves *past* rung 3 into the `revealed` phase, which renders the authored
  solution directly and never calls the model. The branch produced both of the run's
  outright answer leaks — a walkthrough narrating its way to `1 - (-1)` and to `e`.
  Deleted; rung 3 is now the last hint, same two-sentence shape as the others.
- **"Unparseable ⇒ suspect" fired on ~40% of well-behaved replies.** Ordinary maths prose
  is full of things that do not parse: `1^\infty`, `0/0`, `dy/dx`, a quoted `x^2 - 4`
  from the question itself. Every one meant a retry and then a fallback, so the safety
  net was switching the tutor off rather than guarding it. `couldBeTheAnswer` now gates
  suspicion on whether a fragment *could* be the answer — it rules out quoted problem
  text, Leibniz notation, prime notation, unbalanced-paren artifacts, type mismatches,
  and fragments naming symbols the answer never mentions.
- **Two detection holes, both pre-existing and both severe.** The scanner required a
  digit, so every digit-free answer (`-x/y`, `ln(ln(x))`, `-tan(x)`) was invisible in
  plain prose; and it tokenised on characters excluding spaces, so a multi-term answer
  like `x*e^x - e^x` was only ever seen in halves. "So you get -x/y." read as clean.
  Fixed, and `leak.test.ts` now checks all 30 answers across 4 phrasings — 120/120,
  up from 109/120.

**Three things the build order surfaced that the plan had wrong:**

- **Caching the system prompt is a no-op.** The prompt measures ~369 tokens; the minimum
  cacheable prefix is 512 on Opus 5, 1024 on Sonnet 5, 4096 on Haiku 4.5. Below the floor
  a `cache_control` marker is accepted and silently does nothing. `cachingApplies()`
  re-answers this automatically if the prompt grows or a floor moves.
- **Opus 5 does not fit the ceiling.** A pause is up to 3 requests, ~$0.039 against the
  $0.03 ceiling. Its rate card was removed rather than left as a selectable option that
  quietly violates constraint #4. Measured spend is ~$0.0008 per request on Haiku.
- **The quota counts pauses, not requests.** Charging per rung would have turned a
  five-pause allowance into roughly one and a half.

**Still open:**
- **Two shape failures persist:** the model occasionally makes a statement where the
  prompt asks for exactly one question. Harmless in itself — the reply is still a good
  hint — but it is the clearest remaining prompt-adherence gap and the cheapest thing to
  hill-climb next.
- **`rung` and `addresses` are heuristics and warn rather than fail.** Word-overlap
  proxies for semantic questions; `addresses` misses a reply that speaks to the mistake
  in different words. A stricter version means an LLM judge, which the design doc
  rejected on cost. The 3 remaining `addresses` warnings were all read and are fine.
- **The leak validator still cannot catch a leak stated purely in prose** with no
  extractable fragment. Unchanged from the design doc, which handles it by prevention
  plus eval fixtures.
- **No origin or shared-secret protection is configured, and no provider spend cap.**
  The route honours `ZEN_TUTOR_ORIGIN` and `ZEN_TUTOR_SHARED_SECRET` but both are unset,
  so the checks are no-ops today. They matter at deploy, and the real bound on loss is
  the spend cap, which must be set in the provider console before this goes public.
- **The pause UI has not been exercised in a browser.** The route and the checks are
  verified; nobody has watched the world quiet down, the input lock, or the quota message
  in an actual session.

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
- ~~**The ronin was a hand-drawn 20x22 grid.**~~ Done 2026-09-08. Redrawn from
  `Sprites/` at 16 colours on a single 288x96 pixel grid, with a fourth avatar
  slot (hakama) the new sprite made possible.
- **The hall grows a tall ceiling on narrow viewports.** The scene is 3:1 and
  anchors to the bottom of its container, so on a phone (roughly 1.4:1) more
  than half the room is empty wall above the action. It paints the wall colour,
  so it reads as a high ceiling rather than a seam, and the ronin is
  width-constrained at that size regardless — about 70px tall on a 375px
  screen. `preserveAspectRatio="slice"` would fill it and is a no-op at
  desktop's exact 3:1, but starts cropping the post below roughly 1.75:1. The
  real fix is a second, narrower composition for phones rather than a different
  fit rule on the same one.
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
