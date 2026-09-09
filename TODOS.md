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

## The sum is not an answer — fixed 2026-09-09

`31 * 20` was scored **correct** for the question `31 × 20`. Every question in
the mental math drill was answerable by retyping it, so XP, ranks and mastery
were all reachable without doing any arithmetic at all.

**Why it happened, and why the checker was not wrong.** `checkAnswer` grades by
numeric behaviour on purpose — that is what lets `3/3` count for `1` and
`2sin(x)cos(x)` for `sin(2x)` without anyone enumerating forms by hand. `31*20`
evaluates to 620 and so does `620`. The bug was that a drill whose entire point
is performing the arithmetic was consuming a checker built to be indifferent to
how you write it.

**The fix is one flag, not a special case in the grader.** `QuestionSchema`
gained `requireEvaluated` (defaults false; `lib/content/mental.ts` sets it
true). When set, `checkAnswer` parses first and demands a plain number —
optionally signed, optionally parenthesised — before anything is compared.
Anything with an operator, function or symbol left in it returns
`unreadable` with `needsEvaluation: true`.

Three things that were deliberate:
- **It runs before every other path**, including the misconception match. A
  restated sum that happens to land on a distractor is not that misconception,
  and scoring it as one would poison the analytics the tutor reads.
- **The verdict is `unreadable`, not `incorrect`.** Handing the question back is
  not a wrong answer, it is not an answer. Nothing scores and nothing moves.
- **It does not count toward the notation help.** `lib/game/session.ts` skips
  the `consecutiveUnreadable` bump when `needsEvaluation` is set, and the play
  route says "That's the question, not the answer — work it out and type the
  number" rather than "I couldn't read that", which would be a lie about input
  that parsed perfectly.

`lib/content/mental.test.ts` grew a block that retypes all 300 sampled prompts
in ASCII and requires every one to be refused, plus the other unevaluated routes
to the right number (`620 + 0`, `621 - 1`, `1240 / 2`) and the forms that must
still be accepted (`620`, `(620)`, `620.0`). The calculus bank sets the flag
nowhere, and `check.test.ts`'s "3/3 is still 1" case is what holds that line.

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
- ~~**The hall grows a tall ceiling on narrow viewports.**~~ Closed
  2026-09-10 by `/design-review`. The frame is now capped to the art's own
  288x115, the ratio at which the art fills it exactly — the scene is 96 units
  tall inside a 115-row image and the 19 rows left over are precisely the
  ceiling above the viewBox. No band at any width, and no new composition was
  needed after all. The same defect rotated 90 degrees (the room running out
  at the 12:1 pause strip) was fixed alongside it by tiling three deep.
- **Reduced motion is verified by source, not by observation.** All nine
  animation classes are in the `prefers-reduced-motion` block in
  `app/globals.css` — re-confirmed 2026-09-10, one class per keyframe, none
  missing — but the headless browser still cannot emulate the preference, so
  nobody has watched the app with it on. (The tenth, `.anim-hit`, turns out to
  have no consumers at all; see the 2026-09-10 entry.)

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

---

## The strike, from the new attack sheet — shipped 2026-09-09

`RONIN_ATTACK` was a hand-trace. It is now resampled from
`Sprites/roning_attack.png` by `scripts/sprites/ronin-attack.py`, which prints
exactly the rows in the file and the draw position to use with them.

**The sheet draws the sword's arc**, which is the real gain: the strike used to
be a static pose plus two hand-placed rectangles standing in for the flash of
contact. Now the swing itself is art — a crescent that sweeps up over the hat,
across the post and out to x=191 — and the rectangles are gone. What is left at
the contact point is one jade sliver, because jade is what "correct" looks like
everywhere else in this app.

**Placement is computed, not eyeballed.** That sheet renders at about eight
times the app's scale and shares no rig with the idle, so instead of matching
coordinates the script matches anchors: scale so hat-top to feet is 60 rows
(the idle's height), then draw at the x that lines the hat centres up (idle 31,
this 32.5, so x=109) and the y that lands the feet on the floor line (y=2, feet
at row 73 of 74). Verified in a browser: the swap does not move the character.

**The figure now draws after the post.** The arc crosses it, and the brightest
thing in the scene was disappearing behind a stick of wood. The idle ends at
x=154 and the post starts at 164, so nothing else changed.

**Two colour rules carry the decisions:**

- **Steel is value >= 180 and not warm.** Not arbitrary: the robe's brightest
  tone in this frame is 161, so above it is blade or arc and below it is cloth.
  At 165 the downsample's ringing put pale flecks across the torso.
- **The obi is assigned by band (rows 40-56), not by colour.** The sheet paints
  it cream; the ronin wears it red. Matching the paint would mean he changes
  clothes when he swings, and would drop the obi out of the armoury for the
  whole strike, since a cream sash resolves to the hat's ramp rather than the
  obi's. The shin wraps take the same rule from row 60 down.

Checked: every letter the map uses resolves in `resolvePalette`, so there are
no holes, and the robe, hakama and obi slots all still re-colour the pose.

**The first cut had holes in him, fixed the same day.** The sheet has no alpha,
so the figure is cut out by brightness — and the ronin's own outlines and
deepest shadows are as dark as the black he stands on. Cutting at 28 punched
them out of him, and the hall showed through in a scatter of 86 gaps that read
as an unfinished sprite. Three changes, all in the script: the cutoff dropped
to 4 (his darkest tones start just above the background's flat 0), every
background pixel the border cannot reach is filled in, and any pixel the
downsample still leaves transparent with three opaque orthogonal neighbours
takes the commonest colour around it. Genuine gaps — inside the arc's crescent,
between his legs — have at most two neighbours and are untouched. Zero interior
holes now, and the completed silhouette moved the hat centre half a unit, so
the draw position went from x=109 to x=110.

**Still open:**
- **The left-hand pose on that sheet is unused.** It swings the other way. If
  the composition ever puts a second post on the left, or a miss wants its own
  pose instead of the idle plus `anim-flinch`, it is already drawn.
- **The strike is still one frame.** The motion is all CSS; the sheet has no
  in-betweens.
- **The shin wraps read tan here and red on the idle.** The band rule sends
  most of that cream to the leather tones, which looks right on its own but is
  not quite the same character detail. Invisible at 60px; real if the figure
  ever gets bigger.

## Design polish deferred from the 2026-09-10 review

Eight findings were fixed and committed that day; these are what the review
found and did not fix, stopped at the 20% design-fix risk threshold. Full
report in `~/.gstack/projects/Zen_Learner/designs/design-audit-20260910/`.

**Fixed that day, for the record:** the maths rendering in Computer Modern
serif on every calculus question (`.katex` set only `font-size`, and the
comment above it described a rule that was never written); drill blurbs at
eleven characters a line on a phone; the hall's flat maroon slab at narrow
widths and its maroon ends at the 12:1 pause strip; ARMOURY at 49x16; the
finished-session screen having no heading; the 72px rank-up title in the body
face; in-scene labels vanishing into the lit art.

**Two HIGH, both systems-level and both cheap:**

- **Six tracking values, four of them arbitrary, across 9 files.**
  `tracking-widest` x28, `tracking-[0.2em]` x11, plus `[0.3em]`, `[0.25em]`,
  `[0.4em]` and `tracking-wide`. `text-label` alone carries five different
  trackings plus none. `--text-label` was tokenised precisely because the size
  had been written as `text-[10px]` in 21 places, and the same fix stopped one
  step short of `--tracking-label` beside it.
- **No button scale.** Thirteen controls, five padding/size combinations chosen
  per call site. The primary action is `px-6 py-3 text-base` on the home screen
  and `px-5 py-2 text-xs` on the summary screen — the two most important
  buttons in the product, at visibly different weights — plus five different
  hover vocabularies for one tier of control. Three named tiers in
  `globals.css` beside `.pixel-frame` collapses all of it.

**Accessibility, both MEDIUM:**

- **Wrong answers are announced; correct answers are silent.** The live region
  in `app/play/page.tsx` only ever fills for miss, unreadable and
  needs-evaluation. A correct answer's entire feedback is the XP number and the
  strike, both inside the `aria-hidden` SVG. A screen-reader user is told every
  time they are wrong and never told they are right.
- **`TierBars` is unlabelled and is the only content in the app dropped
  entirely below 640px.** It renders bare numerals over `T1`..`T5`, so it reads
  as "24 T1 6 T2", and `hidden sm:flex` removes it with no fallback in a
  codebase that otherwise only ever reflows.

**Systems drift, MEDIUM:**

- **Four panel paddings for one surface** (`p-4`, `p-5`, `p-6`, `p-7`); `p-5`
  is clearly the house value and the question card is the one-site deviation.
  **Four `Dojo` heights** invented at four call sites — the component takes
  `mood` as a typed union but leaves size as a free-form string.
- **Seven ad-hoc opacity modifiers at six values** survived the cleanup that
  was meant to remove them: `border-gold/50` and `border-gold/60` for the same
  warning-frame intent in two files, `bg-ink/85` and `bg-ink/90` ten lines
  apart. Contrast is fine on all of them; this is a systems leak, not a bug.

**Empty states, MEDIUM:**

- **The rank meters read as loading skeletons at zero progress** — two
  full-width rows of dashes. With data they read correctly, which is why this
  was missed twice.
- **Ending a session with nothing answered shows `0%` as the largest thing on
  screen.** An empty state drawn as a failure.
- **Keyboard-only legends still show at 375px** on `/` and `/play`
  ("SHIFT+ENTER WHEN STUCK"), where there is no keyboard. Carried from
  2026-09-09.

**Verified dead, POLISH:** `.anim-hit` and `@keyframes hit-pop` have zero
consumers — about 15 lines including a bespoke reduced-motion clause.
`--color-timber` has zero consumers and `Dojo.tsx:46` hardcodes its value.
Both confirmed by grep, both safe to delete.

**One claim disproved, worth not re-deriving:** the source audit reported
`antialiased` on `<body>` defeating `-webkit-font-smoothing: none` in
`globals.css`, with a specificity argument. Live, the computed value on both
`html` and `body` is `none` — Tailwind v4's layer order keeps the base rule
winning. Not a finding.

## A flurry: fast answers should look like continuous attack

**What:** More than one strike frame, cycled, so that a fast run of correct
answers reads as one continuous flurry instead of the same pose flashing on and
off.

**Why:** the mental math drill is timed and a good streak lands answers a
second apart or better, which is precisely when the animation stops working.

**There is a concrete bug underneath this, and it should be fixed first,
because it is most of the problem and costs nothing.** `app/play/page.tsx` sets
`mood` to `"strike"` and schedules `setMood("idle")` 480ms later, keyed on
`state.lastAward?.seq`. Answer again inside that window and the effect re-runs,
clears the pending timer and sets `"strike"` again — but `mood` never left
`"strike"`, so the `anim-lunge` class never leaves and re-enters the DOM and
**the animation does not replay**.

Measured in a browser, answering twice about 300ms apart, reading
`getAnimations()` off the lunge group:

| when | animation currentTime |
|---|---|
| 150ms after the first answer | 117ms — playing |
| 60ms after the second answer | 333ms — still the *first* one, not restarted |
| 480ms | `[]` — finished, while the pose is still on screen |

So the second strike of a fast pair produces no movement at all, and then a
static lunge sits there until the mood expires. The fix is the pattern the same
file already uses for the XP number: `key={award.seq}` on the animated group in
`Dojo.tsx` remounts it and replays. Do that before drawing anything new.

**Then the frames.** Two sources exist and neither needs new art:

- `Sprites/roning_attack.png` has a second pose, swinging the other way,
  currently unused.
- `Sprites/Rough_ronin_with_straw_h-Sword_attacking_fro` is a full 8-direction
  set of a different attack — sword held across the body, a good wind-up or
  recovery either side of the big swing. It was transcribed once (1:1, since
  that sheet shares the idle's rig) before the arc sheet arrived, so the route
  is known to work.

`scripts/sprites/ronin-attack.py` is parameterised by frame and anchors, so
generating another map is a few minutes.

**The cost is where it always is with this approach: source size.** Each frame
is 74 rows of 83 characters, about 6KB inside `Dojo.tsx`. Three frames is 18KB
of character grid in a component that is already 500 lines. Two ways out, and
they are not equal:

1. Move the maps to a data module and leave `Dojo.tsx` as the renderer. Cheap,
   keeps the avatar palette working, and the grids stop drowning the component.
2. Render the frames to a PNG sprite sheet the way the hall was done. Smaller
   and faster, but it bakes the palette in — the armoury would stop reaching
   the ronin during a strike, which is exactly the trade the hall entry decided
   the other way for the room. Do not take this one without deciding that the
   figure is art rather than kit.

**Also settle:** what drives the cycle. Frame per strike index is the obvious
answer (`award.seq % frames`), so a flurry visibly alternates rather than
repeating. And `prefers-reduced-motion` already cuts `anim-lunge` — a frame
cycle is a new kind of motion and needs its own answer there, probably "hold
one frame".

**Depends on:** nothing. The replay bug is a one-line fix and worth doing on
its own even if no new frames ever land.

## The 16-bit hall — shipped 2026-09-09

`components/Dojo.tsx` no longer draws the room. The wall, floor, shoji bays,
banner and lantern rects are gone; the hall is `public/hall/hall.png`, derived
from `Sprites/Background` (1983x793, 155k colours — an AI render in a pixel
style rather than actual pixel art) by resampling to **288x115 and quantising
to 32 colours**. 288 is the scene's viewBox width, so the room sits on exactly
the grid the ronin does: one art pixel per viewBox unit, nothing on screen
secretly a different resolution from the thing beside it. 11KB.

**The decision the old entry said to make first: the room is art, not a
themeable surface.** Its palette is baked into the PNG. Rank and avatar palette
shifts no longer reach the walls, and that is accepted — the figure is what the
armoury dresses. What stayed in vector is the part that has to respond to
state: the lamp light, now two 7x7 rects sat exactly on the paper of the
lanterns in the art, fading in on a 3+ combo. The `quiet` mood needed no new
treatment after all — the existing whole-scene `opacity-35` reads as the room
in shadow, which was checked in a browser rather than assumed.

`--color-hall-rail`, `-floor`, `-banner`, `-rod` and `-lamp-case-lit` were
deleted with the rects that used them. `--color-hall-wall` survives as the
letterbox band and is now **sampled from the top visible row of hall.png** — if
the art is re-exported, re-sample it or the band stops matching.

**The letterbox is handled by drawing outside the viewBox.** The art is 2.5:1,
the scene is 3:1, and the container is neither (about 7:1 on the home page,
about 1.5:1 on a phone). The root svg clips to the container, not to the
viewBox, so content drawn outside 0-288 paints into the bands `meet` leaves
over. Vertically that is free — the image is 19 rows taller than the scene, so
hanging it at `y=-19` puts its own ceiling beams in the band above. Sideways
there is nothing to continue with, so each side gets the room mirrored; the art
has a lit shoji bay at both ends, so the join reads as more hall rather than as
a fold. The home page is now full-bleed room with no seam.

The figures moved up 2 units (feet at y=75) to land on the platform's lit
boards rather than on its dark front edge.

**Still open:**
- **A phone still gets a band above the room.** 19 rows of real ceiling now,
  then flat `hall-wall` above that. Better than the old flat band, not fixed.
  Slice-filling would frame a phone beautifully — the ronin and the post both
  sit inside the middle 51% — but the same rule crops heads at 7:1, and
  `preserveAspectRatio` cannot be switched by media query. It needs the
  narrower composition the old entry asked for, or a measured container aspect
  in JS, which is a hydration risk for a cosmetic gain.
- **The training post stands in front of the torii and its hanging scroll.**
  Readable, slightly busy. Moving the pair left, in front of the bright shoji
  bay, would silhouette the ronin better; it also moves the XP number and the
  combo count, which live in scene coordinates.
- ~~**`Sprites/Background` is the source and is untracked.**~~ The derivation
  is now `scripts/sprites/hall.py`, which re-prints the `--color-hall-wall`
  value to re-sample along with the PNG. The source art still needs committing
  alongside it.

## Custom problem sets — a topic goes in, a generated set comes out

**What:** A third way in alongside the two authored drills: the learner types a topic
("integration by parts", "logarithm rules") and gets a practice set built for it.

**Why:** The bank is thirty calculus questions. A learner who wants something it does not
cover has nowhere to go, and authoring is the bottleneck the whole project keeps hitting.
This is the feature that makes the app useful beyond what one person had time to write.

**This inverts design doc constraint #1, and that has to be faced rather than discovered.**
The constraint says questions are versioned content files, validated at build time, *never
generated at runtime* — and the reason given is competitive: free Socratic tutoring is
already commoditised, so the authored, misconception-keyed bank is the defensible asset.
A generate-on-demand feature is the thing the constraint exists to prevent.

Two honest readings:

1. **It is a different product surface, not a replacement.** The authored bank stays the
   crown jewels and the spine of progression; generated sets are a scratchpad for topics
   the bank does not reach. Nothing about the bank changes.
2. **It quietly makes the bank optional.** If generated sets are as good, the authored
   thirty are thirty questions of sunk cost, and the moat is gone.

Which one is true depends almost entirely on whether generated questions can be trusted,
which is the engineering problem below.

**The hard part is not generation, it is the answer key.** Everything downstream grades
against `canonicalAnswer` with the equivalence checker. If a model invents the question
*and* its own answer key, a wrong key marks correct work incorrect — the single worst
failure this app can have. It teaches the wrong thing and burns trust in one move, and the
learner has no way to tell whose fault it was.

Mental math is the precedent *for* runtime generation, and it is worth being precise about
why it is safe: it is procedurally generated from arithmetic the code performs itself, and
`lib/content/mental.test.ts` proves over a wide sample that every answer is the arithmetic
it claims. There is no model in that loop. None of that assurance transfers here.

**What makes it defensible, and most of the machinery already exists:**

- Validate every generated question through `QuestionSchema` (Zod). It already demands a
  worked solution of >=2 steps, exactly 3 hint rungs, and >=2 named misconceptions with the
  wrong answers they produce. A model that cannot fill that in has not produced a question.
- Then run the *semantic* checks `scripts/validate-content.ts` already performs on authored
  content, which are the ones that matter: the worked solution's last step must be
  equivalent to `canonicalAnswer`, and every misconception's `wrongAnswer` must be
  genuinely wrong (`validate-content.ts:63`). Both go through `compareAnswers`, which is
  content-agnostic and works on generated questions unchanged.
- Anything failing either pass is dropped silently and regenerated, never shown. Aim to
  over-generate and discard rather than to repair.
- Independently verify by differentiating or evaluating where the answer type allows it —
  the checker already differentiates for antiderivatives.

**The progression question, which is a product call and not a technical one:** ranks are
gated on demonstrated accuracy *at a tier* (constraint #5), and a generated question's tier
is whatever the model claims it is. Let generated sets feed mastery and the gate stops
meaning anything — ask for easy questions labelled tier 5 and rank up on them. The obvious
answer is that generated sets earn no XP and no rank progress, the same call already made
for speed in the mental-math drill, and for the same reason. Settle it before building, or
the gate quietly stops being a gate.

**Pros:** Removes authoring as the ceiling on the product's usefulness. Directly serves the
builder's own stated need — relearning first-year calculus is not confined to thirty
questions. The validation machinery is largely built.

**Cons:** Runs against the project's stated moat (above). Real cost per set, and unlike the
tutor's $0.03-per-pause ceiling this is tens of questions per request — needs its own budget
and quota before a single call is made. Generated hint ladders and misconceptions will be
blander than authored ones even when they are correct, and the misconception-keyed ladder is
the thing the tutor's whole design rests on. Plus a moderation surface the app does not have
today: the topic field is free text from a user, going into a model.

**Context:** `/api/tutor` is the pattern to copy for the route — server-side key, origin
check, shared secret, hard provider spend cap, and dev-mode cost logging. `lib/tutor/config.ts`
already holds the rate cards and the cost arithmetic, and its per-pause ceiling should get a
per-set sibling rather than being reused. The generated bank should be persisted in IndexedDB
next to the profile so a set survives a reload, which means the analytics store's rotation
entry above stops being optional. Reuse `lib/content/drills.ts` as the registry — a generated
set is just another `Question[]`, which is the whole point of the architecture and the reason
this is cheaper to build than it looks.

**Depends on:** Nothing technically. Decide the progression question and the constraint-#1
reading first, because both change what gets built.
