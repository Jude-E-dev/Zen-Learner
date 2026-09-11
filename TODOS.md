# TODOS

Deferred work with enough context to pick up cold. Added by `/plan-eng-review` on 2026-09-07.
Reorganized into gstack's skill/component + priority format by `/ship` on 2026-09-10 — content
preserved verbatim, only the shape changed.

---

## Mental Math

### Promise a "no clock running" tagline where the clock actually doesn't run

**What:** The home page tagline and the calculus card both used to promise "no clock running."
The promise now lives on the calculus card only, where it is still true.

**Why:** Mental math is timed, so the old blanket promise became false for that drill. Worth a
second look if a third drill lands and the phrasing needs to generalize again.

**Effort:** S
**Priority:** P4
**Depends on:** None

### Give the mental-math clock a per-question time target

**What:** No per-question time target exists, so "fast" is measured only against your own
previous times.

**Why:** A target-time band per tier would make the clock mean something on question one,
instead of only becoming meaningful after a learner has a personal baseline.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Reassess the tier 5 mental-math ceiling

**What:** Tier 5 tops out around `41 × 25`.

**Why:** If that stops being a stretch, the ceiling needs raising rather than the range
widening — a note for whoever revisits tier balance.

**Effort:** S
**Priority:** P4
**Depends on:** None

---

## Tutor

### Watch the two remaining tutor shape warnings

**What:** `rung` and `addresses` are heuristics and warn rather than fail. Word-overlap proxies
for semantic questions; `addresses` misses a reply that speaks to the mistake in different
words. The 3 `addresses` warnings from the 2026-09-09 eval run were all read and are fine.

**Why:** A stricter version means an LLM judge, which the design doc rejected on cost. This is a
known, accepted heuristic limit, not a bug — kept as a TODO so the tradeoff isn't re-litigated
from scratch later.

**Context:** The exactly-one-question shape failures (2/22 as of 2026-09-09) were fixed
2026-09-10 — see Completed below. This entry is about the separate `rung`/`addresses` warnings,
which are unaffected by that fix.

**Effort:** L (would need an LLM judge)
**Priority:** P4
**Depends on:** None

### The leak validator cannot catch a purely-prose leak

**What:** The leak validator still cannot catch a leak stated purely in prose with no
extractable fragment.

**Why:** Unchanged from the design doc, which handles this case by prevention (the system
prompt forbids it) plus eval fixtures probing for exactly that — not by this validator. A
runtime LLM judge would catch it and roughly double the per-pause cost, a ceiling chosen
deliberately.

**Effort:** L
**Priority:** P4
**Depends on:** None

### Set the tutor's origin/secret env vars and a provider spend cap before going public

**What:** The route honours `ZEN_TUTOR_ORIGIN` and `ZEN_TUTOR_SHARED_SECRET` (or its
client-readable twin `NEXT_PUBLIC_ZEN_TUTOR_SECRET` — see 2026-09-10 fix below), but none of
them are set in any deployed environment yet, so the checks are no-ops today. No provider
spend cap is configured either.

**Why:** These matter at deploy, not in local dev. The real bound on worst-case loss is the
provider-level spend cap — that must be set in the provider console before this goes public,
regardless of the origin/secret checks (which are documented in the code as convenience
guards, not real security).

**Effort:** S (ops config, not code)
**Priority:** P1
**Depends on:** Going public with the key configured.

### Exercise the pause UI in a real browser

**What:** The route and the checks are verified programmatically; nobody has watched the world
quiet down, the input lock, or the quota message in an actual session.

**Why:** Automated coverage (unit tests + the live-model eval) proves the logic; it doesn't
prove the UX reads correctly to an actual learner mid-session.

**Effort:** S
**Priority:** P2
**Depends on:** None

---

## Analytics

### Cap or rotate the analytics event store

**What:** Add a size cap or rotation policy to the IndexedDB analytics event store.

**Why:** The eng review settled on buffering every event in IndexedDB with a dev-only export to
`.jsonl`. Nothing ever removes them, so the store grows for the life of the browser profile —
every question latency, every pause, every session, forever. Exports get slower over time, and
the store eventually competes with actual progress data for the origin's storage quota.

**Context:** The stack is IndexedDB-only with no server store, so this data has nowhere else to
live. A ring buffer keeping the last N sessions (50 is a reasonable default) or an
export-then-prune flow both solve it. The trigger to act: export times becoming noticeable, or
the browser surfacing a storage warning.

Pros: bounded storage, fast exports, and no risk of a browser eviction event taking progress
data with it (eviction is origin-wide — it does not spare the progress records). Cons: rotation
means older sessions age out, which is awkward for a session-1 vs session-5 comparison if the
retention window is set too small.

**Effort:** M
**Priority:** P3
**Depends on:** Stage 4 (persistence layer) existing first — it does now.

---

## Content

### Re-add linear algebra, including its equivalence-checker work

**What:** Restore the linear algebra topic (~30 more questions) after the calculus slice proves
out — and budget for the checker work it requires, which is larger than it looks.

**Why:** Linear algebra was cut from the vertical slice for authoring cost and per-tier question
density, not because it doesn't belong. It is half of the original stated practice need. The cut
obscured a real cost: linear algebra is where answer-equivalence checking gets genuinely hard,
and none of that work exists in the current plan.

**Context:** The current checker (mathjs parse + domain-safe numeric sampling, with
differentiation for antiderivatives) handles scalar and symbolic expressions in one variable.
None of those techniques transfer to matrices, sets, or basis equivalence:
- Matrix answers need dimension-aware comparison, not scalar sampling.
- Eigenvalue answers are sets — order must not affect correctness.
- Null-space and eigenspace bases are non-unique, so two correct answers can look completely
  different and both be right (requires span/row-equivalence comparison, not value comparison).

Pros: restores the full practice scope originally wanted, and by then the loop is proven, so the
authoring effort goes into something known to work. Cons: the checker work is closer to a second
checker than an extension of the first (see above).

**Effort:** XL
**Priority:** P4
**Depends on:** The calculus slice shipping, and the two instrumentation hypotheses being
answered first.

### Custom problem sets — a topic goes in, a generated set comes out

**What:** A third way in alongside the two authored drills: the learner types a topic
("integration by parts", "logarithm rules") and gets a practice set built for it.

**Why:** The bank is thirty calculus questions. A learner who wants something it does not cover
has nowhere to go, and authoring is the bottleneck the whole project keeps hitting. This is the
feature that makes the app useful beyond what one person had time to write.

**Context:** This inverts design doc constraint #1, and that has to be faced rather than
discovered. The constraint says questions are versioned content files, validated at build time,
*never generated at runtime* — and the reason given is competitive: free Socratic tutoring is
already commoditised, so the authored, misconception-keyed bank is the defensible asset. A
generate-on-demand feature is the thing the constraint exists to prevent.

Two honest readings:
1. It is a different product surface, not a replacement — the authored bank stays the crown
   jewels and the spine of progression; generated sets are a scratchpad for topics the bank
   does not reach.
2. It quietly makes the bank optional — if generated sets are as good, the authored thirty are
   thirty questions of sunk cost, and the moat is gone.

Which one is true depends almost entirely on whether generated questions can be trusted, which
is the engineering problem below.

**The hard part is not generation, it is the answer key.** Everything downstream grades against
`canonicalAnswer` with the equivalence checker. If a model invents the question *and* its own
answer key, a wrong key marks correct work incorrect — the single worst failure this app can
have. Mental math is the precedent *for* runtime generation, and it is worth being precise about
why it is safe: it is procedurally generated from arithmetic the code performs itself, with no
model in the loop. None of that assurance transfers here.

**What makes it defensible, and most of the machinery already exists:**
- Validate every generated question through `QuestionSchema` (Zod) — it already demands a
  worked solution of >=2 steps, exactly 3 hint rungs, and >=2 named misconceptions with the
  wrong answers they produce.
- Then run the *semantic* checks `scripts/validate-content.ts` already performs on authored
  content: the worked solution's last step must be equivalent to `canonicalAnswer`, and every
  misconception's `wrongAnswer` must be genuinely wrong (`validate-content.ts:63`). Both go
  through `compareAnswers`, which is content-agnostic and works on generated questions
  unchanged.
- Anything failing either pass is dropped silently and regenerated, never shown. Aim to
  over-generate and discard rather than to repair.
- Independently verify by differentiating or evaluating where the answer type allows it — the
  checker already differentiates for antiderivatives.

**The progression question, which is a product call and not a technical one:** ranks are gated
on demonstrated accuracy *at a tier* (constraint #5), and a generated question's tier is
whatever the model claims it is. The obvious answer is that generated sets earn no XP and no
rank progress, the same call already made for speed in the mental-math drill, and for the same
reason. Settle it before building, or the gate quietly stops being a gate.

Pros: removes authoring as the ceiling on the product's usefulness; directly serves the
builder's own stated need; the validation machinery is largely built. Cons: runs against the
project's stated moat (above); real cost per set (tens of questions per request, needs its own
budget and quota); generated hint ladders and misconceptions will be blander than authored ones
even when correct; a moderation surface the app does not have today (the topic field is free
text from a user, going into a model).

**Context for the route:** `/api/tutor` is the pattern to copy — server-side key, origin check,
shared secret, hard provider spend cap, and dev-mode cost logging. `lib/tutor/config.ts` already
holds the rate cards and cost arithmetic, and its per-pause ceiling should get a per-set sibling
rather than being reused. The generated bank should be persisted in IndexedDB next to the
profile, which means the analytics store's rotation entry above stops being optional. Reuse
`lib/content/drills.ts` as the registry — a generated set is just another `Question[]`.

**Effort:** XL
**Priority:** P4
**Depends on:** Nothing technically. Decide the progression question and the constraint-#1
reading first, because both change what gets built.

---

## Avatar

### Coins — the half of the avatar feature that is still missing

**What:** Coins awarded alongside XP (scaled by tier, reduced after a pause, same as XP), and a
decision about what they buy now that rank already gates the cosmetics.

**Why:** The avatar shipped 2026-09-08 (three slots, rank-gated) via `/design-review`, but ranks
gate the *palette* tiers, leaving no role for a currency. The obvious answer is that the two
gate different things: rank unlocks palette tiers, coins buy *parts* (blade, kasa shape, banner)
that rank does not touch. Settle that before building the wallet, or coins end up duplicating a
gate that already works.

**Context:** Why rank and not coins in the first place — the design review put the avatar on
the home page because the page had dead space and nothing to grow into, which made the avatar
available before the currency meant to gate it existed, and a shop with imaginary money in it is
worse than no shop. Ranks are already earned and already mean something.

Keep it strictly cosmetic — the moment a purchase affects difficulty or hints, the mastery gate
stops meaning anything. No third-party sprite packs; the existing parts are all drawn as
character-grid pixel maps in `components/Dojo.tsx`, and the palette plumbing to extend them is
in `lib/game/avatar.ts`.

The summary card still shows a percentage rather than your ronin — putting it there is a small,
worthwhile follow-up, since sharing is this project's only distribution channel.

**Effort:** L
**Priority:** P3
**Depends on:** None

---

## Art & Sprites

### The left-hand attack pose is unused

**What:** `Sprites/roning_attack.png`'s left-hand pose (swings the other way) is currently
unused.

**Why:** If the composition ever puts a second post on the left, or a miss wants its own pose
instead of the idle plus `anim-flinch`, it is already drawn — worth noting so it isn't
re-sourced later.

**Effort:** S
**Priority:** P4
**Depends on:** None

### The strike is still one frame

**What:** The attack motion is all CSS; the sheet has no in-betweens.

**Why:** See "A flurry: fast answers should look like continuous attack" below — this is the
raw-material half of that problem.

**Effort:** M
**Priority:** P4
**Depends on:** None

### The shin wraps read a different color on the strike vs. the idle pose

**What:** The band rule used for the strike sprite sends most of the sheet's cream to leather
tones on the shin wraps, which looks right on its own but doesn't quite match the idle pose's
red.

**Why:** Invisible at 60px; would become a real character-detail mismatch if the figure ever
gets bigger.

**Effort:** S
**Priority:** P4
**Depends on:** None

### A phone still gets a ceiling band above the hall

**What:** 19 rows of real ceiling render above the room on a phone now (down from a flat
maroon band, fixed 2026-09-10 — see Design below), then flat `hall-wall` above that.

**Why:** Slice-filling would frame a phone beautifully — the ronin and the post both sit inside
the middle 51% — but the same rule crops heads at the desktop 7:1 ratio, and
`preserveAspectRatio` cannot be switched by media query. It needs the narrower composition
originally requested, or a measured container aspect in JS, which is a hydration risk for a
cosmetic gain.

**Effort:** L
**Priority:** P3
**Depends on:** A narrower art composition, or accepting the JS-measurement hydration risk.

### The training post partially obscures the torii behind it

**What:** The training post stands in front of the torii and its hanging scroll in the new hall
art — readable, slightly busy.

**Why:** Moving the pair left, in front of the bright shoji bay, would silhouette the ronin
better. It also moves the XP number and the combo count, which live in scene coordinates, so
it's not a free change.

**Effort:** M
**Priority:** P4
**Depends on:** None

### Commit the hall art source alongside its derivation script

**What:** `Sprites/Background` (the hall source art) still needs committing.

**Why:** The derivation is now `scripts/sprites/hall.py`, which re-prints the
`--color-hall-wall` value to re-sample along with the PNG — the script exists, but its source
input isn't tracked yet.

**Effort:** S
**Priority:** P3
**Depends on:** None

---

## Animation

### A flurry: fast answers should look like continuous attack

**What:** More than one strike frame, cycled, so a fast run of correct answers reads as one
continuous flurry instead of the same pose flashing on and off.

**Why:** The mental math drill is timed and a good streak lands answers a second apart or
better, which is precisely when the animation stops working.

**The concrete bug underneath this is fixed** — see Completed below. This entry is now just the
multi-frame flurry itself.

**The frames.** Two sources exist and neither needs new art: `Sprites/roning_attack.png`'s
unused second pose, and `Sprites/Rough_ronin_with_straw_h-Sword_attacking_fro` (a full
8-direction set of a different attack, already transcribed once before the arc sheet arrived, so
the route is known to work). `scripts/sprites/ronin-attack.py` is parameterised by frame and
anchors, so generating another map is a few minutes.

**The cost is where it always is with this approach: source size.** Each frame is 74 rows of 83
characters, about 6KB inside `Dojo.tsx`. Three frames is 18KB of character grid in a component
that is already several hundred lines. Two ways out, not equal:
1. Move the maps to a data module and leave `Dojo.tsx` as the renderer — cheap, keeps the avatar
   palette working.
2. Render the frames to a PNG sprite sheet the way the hall was done — smaller and faster, but
   bakes the palette in, so the armoury would stop reaching the ronin during a strike (the
   opposite trade the hall entry made for the room). Do not take this one without deciding the
   figure is art rather than kit.

**Also settle:** what drives the cycle. Frame per strike index is the obvious answer
(`award.seq % frames`), so a flurry visibly alternates rather than repeating. And
`prefers-reduced-motion` already cuts `anim-lunge` — a frame cycle is a new kind of motion and
needs its own answer there, probably "hold one frame".

**Effort:** M
**Priority:** P4
**Depends on:** None

---

## Audio

### Revisit the audio layer (cut from the vertical slice)

**What:** One ambient loop plus a small SFX set, muted by default, toggleable, and remembered.

**Why:** Cut during the eng review because it ships muted by default and answers neither
instrumentation hypothesis. Not a bad idea, just not one that earns its place before the loop is
proven.

**Context:** The build prompt asks for the toggle state to be remembered, so this wants the
persistence layer in place (it now exists). Respect `prefers-reduced-motion` neighbours here too
— an audio equivalent doesn't exist as a media feature, so a first-run default of muted is doing
that job.

Pros: a large part of the 16-bit feel the project is going for; hit/miss cues would carry real
weight alongside existing visual feedback. Cons: needs asset sourcing under a clean licence,
which the plan explicitly constrains.

**Effort:** L
**Priority:** P4
**Depends on:** The core loop being proven fun (the session-1 vs session-5 measurement).

---

## Design System

Remaining findings from the 2026-09-10 design review that were stopped at the 20% design-fix
risk threshold (eight others were fixed and committed that day — see Completed). Full report in
`~/.gstack/projects/Zen_Learner/designs/design-audit-20260910/`.

### Unify tracking (letter-spacing) into a small token set

**What:** Six tracking values, four of them arbitrary, spread across 9 files:
`tracking-widest` x28, `tracking-[0.2em]` x11, plus `[0.3em]`, `[0.25em]`, `[0.4em]` and
`tracking-wide`. `text-label` alone carries five different trackings plus none.

**Why:** `--text-label` was tokenised precisely because the size had been written as
`text-[10px]` in 21 places, and the same fix stopped one step short of a `--tracking-label`
token beside it.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Introduce a named button scale

**What:** Thirteen controls, five padding/size combinations chosen per call site. The primary
action is `px-6 py-3 text-base` on the home screen and `px-5 py-2 text-xs` on the summary screen
— the two most important buttons in the product, at visibly different weights — plus five
different hover vocabularies for one tier of control.

**Why:** Three named tiers in `globals.css` beside `.pixel-frame` would collapse all of it into
one system.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Converge on one panel padding and one Dojo height API

**What:** Four panel paddings for one surface (`p-4`, `p-5`, `p-6`, `p-7`) — `p-5` is clearly the
house value and the question card is the one-site deviation. Four `Dojo` heights invented at
four call sites — the component takes `mood` as a typed union but leaves size as a free-form
string.

**Why:** Systems drift: each deviation was probably reasonable in isolation, but together they
erode the token system's value.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Consolidate opacity modifiers

**What:** Seven ad-hoc opacity modifiers at six values survived an earlier cleanup meant to
remove them: `border-gold/50` and `border-gold/60` for the same warning-frame intent in two
files, `bg-ink/85` and `bg-ink/90` ten lines apart.

**Why:** Contrast is fine on all of them — this is a systems leak, not a bug, but worth fixing
before it compounds further.

**Effort:** S
**Priority:** P4
**Depends on:** None

### Fix three empty-state regressions

**What:** Three related gaps: rank meters read as loading skeletons at zero progress (two
full-width rows of dashes); ending a session with nothing answered shows `0%` as the largest
thing on screen; keyboard-only legends ("SHIFT+ENTER WHEN STUCK") still show at 375px on `/` and
`/play`, where there is no keyboard (carried from 2026-09-09).

**Why:** Each reads correctly with real data, which is why each was missed — genuine empty-state
gaps rather than always-broken UI.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Delete verified-dead animation and color code

**What:** `.anim-hit` and `@keyframes hit-pop` have zero consumers (about 15 lines including a
bespoke reduced-motion clause). `--color-timber` has zero consumers and `Dojo.tsx:46` hardcodes
its value instead.

**Why:** Both confirmed by grep, both safe to delete — pure cleanup.

**Effort:** S
**Priority:** P4
**Depends on:** None

### Watch the phone hall ceiling band and reduced-motion-in-browser verification

See "A phone still gets a ceiling band above the hall" under Art & Sprites, and "Verify
`prefers-reduced-motion` by observation, not just by source" below — both carried forward from
the design review rather than duplicated here.

### Verify `prefers-reduced-motion` by observation, not just by source

**What:** All animation classes are confirmed present in the `prefers-reduced-motion` block in
`app/globals.css` by source (re-confirmed 2026-09-10, one class per keyframe, none missing), but
nobody has watched the app with the OS preference actually on.

**Why:** The headless browser used for the design reviews cannot emulate the preference, so this
needs a real device/browser check.

**Effort:** S
**Priority:** P3
**Depends on:** None

---

## Completed

### Give TierBars a label and a sub-640px fallback

`TierBars` was unlabelled and was the only content in the app dropped entirely below 640px. It
rendered bare numerals over `T1`..`T5`, so it read as "24 T1 6 T2" to a screen reader, and
`hidden sm:flex` removed it with no fallback in a codebase that otherwise only ever reflows.

Both the bar chart and a new mobile text summary ("T1 4 · T2 9 · ...") now share one
`aria-label` so the announcement is the same regardless of breakpoint. Verified in a browser at
375px (text fallback shows) and 1280px (bars still render).

**Completed:** 2026-09-12

### Announce correct answers, not just wrong ones

The live region in `app/play/page.tsx` only ever filled for miss, unreadable and
needs-evaluation. A correct answer's entire feedback was the XP number and the strike, both
inside the `aria-hidden` SVG — a screen-reader user was told every time they were wrong and
never told they were right.

Two things this surfaced along the way, both fixed:
- Can't key the new message off `result?.verdict === "correct"`: a correct `submitAnswer` moves
  straight into the next question in the same update (`freshQuestion` resets `lastResult` to
  null, "no confirmation step"), so `state.lastResult` is already null by the time this renders.
  `award` is the right signal — the same state the XP number and strike animation already key
  off.
- A wrong or unreadable answer does not clear `award` (its effect bails out early on a null
  `state.lastAward`), so without also checking `result === null`, a miss inside the same ~700ms
  window showed "Correct" and "Not quite" at once. Found and fixed by testing the race live
  against the dev server, not just by inspection.

**Completed:** 2026-09-12

### The strike animation replays on a fast correct-answer streak

`app/play/page.tsx` sets `mood` to `"strike"` and schedules `setMood("idle")` 480ms later, keyed
on `state.lastAward?.seq`. Answering again inside that window re-ran the effect and reset the
timer, but `mood` never left `"strike"` — so the `anim-lunge`/`anim-arc` classes never left and
re-entered the DOM, and the second strike of a fast pair played no animation at all.

Fixed the same way the adjacent XP-number badge already handles this: `key={award.seq}` on both
the lunge group and the arc cue forces a remount, which restarts the CSS animation.

Precise before/after timing of the fix itself was hard to verify through browser automation (the
480ms window is shorter than a CLI round-trip), so this rests on the fix being the exact,
already-proven pattern used one prop over, plus the full test suite and typecheck passing clean.

**Completed:** 2026-09-12 (the replay bug only — the larger multi-frame flurry is still open,
see Animation above)

### Mental math drill

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

Remaining open sub-items moved to the Mental Math section above.

**Completed:** 2026-09-08

### The sum is not an answer

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

**Completed:** 2026-09-09

### Tutor layer (stage 5)

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
| after the 2026-09-10 "one question" fix | 0 | 0 | 1 | 3 | 18/22 |

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
- **Both remaining shape failures (2026-09-09) were the same rule read two different
  ways, fixed 2026-09-10.** `limit-factorable` chained two questions; `implicit-diff-trig`'s
  last rung wrote an imperative instead of a question. The rule became an output
  contract — exactly one question mark, the question ends the reply — with a closing
  "BEFORE YOU SEND" block naming both failure modes. 0 shape failures after, 18/22 clean
  (up from 14/22). $0.0205 for the confirming run.

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

Remaining open sub-items moved to the Tutor section above.

**Completed:** 2026-09-09 (eval-verified), with a further fix 2026-09-10

### The strike, from the new attack sheet

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

Remaining open sub-items moved to Art & Sprites above.

**Completed:** 2026-09-09

### The 16-bit hall

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

Remaining open sub-items moved to Art & Sprites above.

**Completed:** 2026-09-09

### Design polish — 2026-09-08 review (3 of 5 findings)

Full report in `~/.gstack/projects/Zen_Learner/designs/design-audit-20260908/`.

- The play route had no `<h1>`. Both the play route and a shared summary now carry a
  visually hidden heading.
- No pixel typeface. Silkscreen (OFL, self-hosted via `next/font`) on the display layer
  only; body copy, the answer input and anything KaTeX touches stay monospace.
- The ronin was a hand-drawn 20x22 grid. Redrawn from `Sprites/` at 16 colours on a single
  288x96 pixel grid, with a fourth avatar slot (hakama) the new sprite made possible.

The remaining two findings from this review (the hall ceiling and reduced-motion
verification) are tracked below — the ceiling one closed 2026-09-10, reduced-motion
verification is still open (see Design System above).

**Completed:** 2026-09-08

### The hall grows a tall ceiling on narrow viewports

**What it was:** The dojo scene was 3:1 and anchored to the bottom of its container, so on a
phone (roughly 1.4:1) more than half the room was empty wall above the action, reading as a
high ceiling.

**The fix:** The frame is now capped to the art's own 288x115, the ratio at which the art fills
it exactly — the scene is 96 units tall inside a 115-row image and the 19 rows left over are
precisely the ceiling above the viewBox. No band at any width, and no new composition was needed
after all. The same defect rotated 90 degrees (the room running out at the 12:1 pause strip) was
fixed alongside it by tiling three deep.

**Completed:** 2026-09-10, by `/design-review`

### Design polish — 2026-09-10 review (8 findings)

Full report in `~/.gstack/projects/Zen_Learner/designs/design-audit-20260910/`. Fixed and
committed that day: the maths rendering in Computer Modern serif on every calculus question
(`.katex` set only `font-size`, and the comment above it described a rule that was never
written); drill blurbs at eleven characters a line on a phone; the hall's flat maroon slab at
narrow widths and its maroon ends at the 12:1 pause strip; ARMOURY at 49x16; the finished-session
screen having no heading; the 72px rank-up title in the body face; in-scene labels vanishing into
the lit art; the hall ceiling (tracked separately above).

One claim from the source audit was disproved and is worth not re-deriving: `antialiased` on
`<body>` was reported as defeating `-webkit-font-smoothing: none` in `globals.css`, with a
specificity argument. Live, the computed value on both `html` and `body` is `none` — Tailwind
v4's layer order keeps the base rule winning. Not a finding.

The findings this review surfaced but did NOT fix (stopped at the 20% design-fix risk threshold)
are tracked individually under Design System and Art & Sprites above.

**Completed:** 2026-09-10 (partial — 8 of the review's findings; the rest are open TODOs)

### The reply is exactly one question, every time

The eval had sat at 2 shape failures out of 22 since stage 5 shipped, and the runner exits
non-zero on any failure, so the pre-merge gate was permanently red and told you nothing.

Both failures were the same rule read two different ways. `limit-factorable` chained two
questions ("what are they? ... what can you cancel?"); the `implicit-diff-trig` last rung wrote
an imperative instead ("check what you moved to which side"), which is zero questions by the
check and reads as an instruction rather than a nudge.

The rule was stated once, mid-list, as "at most two sentences, exactly one of them is a
question." It is now an output contract: exactly one question mark, the question ends the reply,
and a closing BEFORE YOU SEND block names both failure modes with the model's own words as the
examples.

Measured, 22 fixtures against the live model: before 0 leak · 2 shape · 3 rung · 3 addresses ·
14/22 clean · exit 1 — after 0 leak · 0 shape · 1 rung · 3 addresses · 18/22 clean · exit 0.

**Completed:** 2026-09-10
