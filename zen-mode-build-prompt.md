# Build prompt — Zen Mode vertical slice

> Paste everything below the line into Claude Code. Written for a fresh, empty repo.
> Edit the two bracketed choices in §3 if you want a different stack.

---

Build a playable vertical slice of **Zen Mode**: a 16-bit ronin-themed practice platform where a learner picks a topic, enters an immersive grind of practice questions, earns XP and coins, and climbs ranks — and when they get stuck, pauses the grind for constrained Socratic tutoring before resuming.

Before writing code, read §1 carefully. Several requirements there look like they could be simplified away. They can't — each one exists because of a specific way this product fails. If you think one is wrong, say so before building rather than quietly deviating.

## 1. Non-negotiable constraints (and why)

**1.1 — The question bank is the product. The tutor is a feature.**
Free Socratic tutoring now ships inside ChatGPT, Gemini and Claude. Anything we build whose value lives in "an LLM explains things" is already commoditised. The defensible asset is a rigorous, authored, answer-keyed question bank with worked solutions. So: questions are versioned content files in the repo, validated by schema at build time, never generated at runtime, and never stored only in a database. Treat `content/` as the crown jewels and design everything else around serving it.

**1.2 — The tutor is answer-keyed and constrained. It never free-reasons.**
A tutor that confidently walks a student down a wrong chain is worse than no tutor. The model must never be asked to solve the problem. It receives the authored worked solution, the authored hint ladder, the student's actual wrong answer, and the step they're stuck on — and its only job is to convert the next authored hint into a question tailored to the mistake they just made. Enforce this in the architecture, not the prompt:

- Every question ships with a 3-rung authored hint ladder written by a human.
- The tutor's output is *validated* before display: it must not contain the final answer (numeric/symbolic comparison against the answer key, plus a check against the next-step value). On failure, retry once at temperature 0; on second failure, display the raw authored hint instead.
- Log every fallback. The fallback rate is a headline quality metric, not an edge case.
- Consequence worth internalising: **the product must remain fully usable with the AI layer switched off.** Build the authored ladder path first and make it good. The AI layer is a progressive enhancement over it. If you build the AI path first, you will end up with a chatbot wearing a game skin.

**1.3 — Hard cost ceilings on tutoring.**
Route to a small/cheap model by default; escalate only on validation failure. Cache the system prompt and the question's worked solution. Enforce a per-session token budget and a per-user daily pause quota (default 5), both in config, both logged. Target: **under US$0.03 per tutoring session.** Print running estimated cost in dev mode so the number is never a mystery.

**1.4 — Progression must have long-horizon structure, not just numbers going up.**
Gamification reliably produces a novelty spike that decays. XP, coins and ranks are table stakes and will not retain anyone past week three on their own. So the progression system needs at least one mechanic whose payoff sits weeks out and which is *tied to actual mastery*, not to time spent. Implement: ranks gated on **demonstrated accuracy at a difficulty tier**, not on cumulative XP. You cannot grind your way to Ronin by farming easy questions. Make the gate visible and legible from the first session.

**1.5 — Built to be clipped and shared.**
Paid acquisition does not work at this price point (comparable AU tutoring businesses pay ~A$199 per acquired student while losing money). Organic is the only channel. So the artifact needs to be screenshot-worthy and share-worthy from day one: a rank-up moment that is visually loud, a post-session summary card that is deliberately composed for a screenshot, and a shareable permalink for a completed session. This is a product requirement, not marketing polish. Build the summary card in this slice.

**1.6 — Instrument the risky hypotheses, not vanity metrics.**
Log events locally (JSONL is fine for the slice) for: session start/end, per-question latency, correct/incorrect, pause invoked, pause resolved-to-correct, hint rung reached, tutor fallback fired, rank-up, session abandoned mid-stream. The two questions this slice exists to answer are: *does the pause actually unstick people* (pause → next-attempt-correct rate) and *does the loop survive its own novelty* (session 1 vs session 5 length and voluntary return). Make both queryable from a single script.

## 2. Scope of this build

**In:** one continuous playable experience — topic select → Zen Mode grind → pause/tutor → resume → session summary card. ~60 authored questions. XP, coins, ranks, streak-within-session. Local persistence. Full 16-bit ronin presentation.

**Out (do not build):** auth, payments, subscriptions, user accounts, multi-device sync, leaderboards, social features, an authoring admin UI, mobile apps, any B2B/classroom/teacher surface. If you find yourself building any of these, stop.

## 3. Stack

Default, unless you have a concrete reason to differ — say so first if you do:

- **[Next.js (App Router) + TypeScript + Tailwind]**, deployed-able to Vercel, single package.
- **[Persistence: IndexedDB via a thin typed wrapper — no backend database in this slice.]** Progress is local. Design the persistence layer behind an interface so a server-backed implementation drops in later without touching game logic.
- One server route for tutoring so the API key stays server-side. Model configurable via env; default to a small fast model.
- Question content: **MDX or YAML files under `content/`**, parsed and schema-validated at build time (Zod). Build fails on invalid content. Do not put questions in a database.

## 4. Question schema

Design the schema yourself, but it must carry at minimum: stable id, topic, subtopic, difficulty tier (1–5), the prompt (LaTeX-capable), answer type and canonical answer, an equivalence checker spec (so `1/2`, `0.5` and `\frac{1}{2}` all pass, and so algebraic forms compare correctly), **an ordered worked solution broken into discrete steps**, **a 3-rung authored hint ladder**, and 2–4 named common-misconception distractors with the wrong answer each produces.

That last field matters more than it looks: it is what lets the tutor say something specific about *this* mistake without reasoning about the problem. Populate it properly.

Ship a `pnpm validate:content` script that checks schema conformance, verifies every canonical answer against the final worked-solution step, and flags any question missing hints or misconceptions.

## 5. Content for this slice

~60 questions, first-year undergraduate level, split roughly evenly:

- **Calculus:** chain rule, product/quotient rule, implicit differentiation, u-substitution, integration by parts, definite integrals with bounds, limits (indeterminate forms).
- **Linear algebra:** matrix multiplication, determinants (2×2, 3×3), row reduction to RREF, matrix inverse, eigenvalues of 2×2 matrices, linear independence, rank/nullity.

Spread across difficulty tiers 1–5 with more mass at 2–3. Write real questions with correct worked solutions — do not stub these, and do not generate them with a loose one-shot pass and move on. Verify the maths. Where a question has a computable answer, add a unit test asserting the answer key is correct (e.g. via a CAS check or a hand-verified fixture). **Content errors are the fastest way to destroy trust in a product like this.**

## 6. The Zen loop

Continuous stream, not a quiz with a fixed end. Questions arrive one at a time from a selector that adapts on rolling accuracy: 3 correct in a row at a tier promotes; 2 wrong at a tier demotes. No timers, no punishment for slowness — the fantasy is *focused calm*, not pressure. That is the whole reason it is called Zen Mode; do not add a countdown clock.

Feel matters as much as logic here:

- Instant, tactile feedback on answer submit. Chunky pixel-font damage numbers, a satisfying hit on correct, a soft non-punitive miss on wrong.
- Keyboard-first input. Enter submits, Enter advances. A learner should be able to run 30 questions without touching the mouse.
- A persistent HUD: XP bar, coin counter, current rank, session streak.
- Everything drawn at a consistent pixel grid, integer-scaled, with `image-rendering: pixelated`. No blurry upscaling — it reads as cheap immediately.
- CSS/SVG-drawn assets are fine; no third-party sprite packs with unclear licensing.
- One ambient loop and a small set of SFX, muted by default, toggleable, remembered.

Respect `prefers-reduced-motion` — cut screen shake and particles, keep the state changes.

## 7. The Socratic pause

Triggered manually by the learner ("I'm stuck") or offered after 2 consecutive wrong attempts on the same question. Entering the pause visibly changes the world state — the grind quiets down, the tutor arrives. Leaving it drops you back mid-stream with the question intact.

The exchange is short by design: the tutor asks **one question at a time, two sentences maximum**, and the learner types a reply. Each turn advances at most one rung of the authored hint ladder. After rung 3, the tutor stops asking and reveals the worked solution step by step. **There is no infinite chat.** A learner who wants to argue with a chatbot has three free ones; ours exists to get them back into the grind.

Resuming after a pause: the question is re-presented fresh, and a correct answer earns reduced XP but no penalty framing. Getting unstuck is a win.

## 8. Build order

Work in this order and get each stage genuinely working before moving on:

1. Content schema + validator + 10 real questions + answer-equivalence checking with tests.
2. The Zen loop with authored hints only, no AI. Playable end to end.
3. Presentation pass — pixel HUD, feedback juice, sound, reduced-motion.
4. Progression: XP, coins, mastery-gated ranks, persistence.
5. The constrained tutor layer with output validation, fallback and cost logging.
6. Session summary card + shareable permalink.
7. Remaining questions to ~60, all verified.
8. Analytics script answering the two §1.6 questions.

Commit at each stage. Keep a `DECISIONS.md` recording anything you chose that a future contributor would otherwise re-litigate.

## 9. Definition of done

- I can complete a 20-question session without touching the mouse, and it feels good.
- I can get stuck, pause, be genuinely helped without being handed the answer, and resume.
- `pnpm validate:content` passes and every answer key is test-verified.
- Pulling the API key out entirely leaves the app fully playable via authored hints.
- Estimated tutoring cost per session prints in dev and sits under US$0.03.
- The summary card is something I would actually screenshot.
- README explains how to add a question, and the analytics script answers: pause→correct rate, and session-1 vs session-5 length.

Ask me about anything genuinely ambiguous before building. Do not ask permission to start.
