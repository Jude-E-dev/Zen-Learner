Build a playable vertical slice of **Zen Mode**: a 16-bit ronin-themed practice platform where a learner requests any topic, receives a premium AI-generated practice set, enters an immersive grind, earns XP and coins, and climbs ranks — and when they get stuck, pauses the grind for constrained Socratic tutoring before resuming.

Before writing code, read §1 carefully. Several requirements there look like they could be simplified away. They can't — each one exists because of a specific way this product fails. If you think one is wrong, say so before building rather than quietly deviating.

## 1. Non-negotiable constraints (and why)

**1.1 — Premium generated practice sets are the product. The tutor is a feature.**
Free Socratic tutoring now ships inside ChatGPT, Gemini and Claude. Anything we build whose value lives in "an LLM explains things" is already commoditised. Zen Mode's value is a learner being able to name *any* subject — from first-year calculus to Fourier theory, a certification syllabus, or a niche historical topic — and immediately receive a coherent, rigorous, answer-keyed set calibrated to their requested level.

Questions are generated when a set is requested, then stored as immutable, versioned session content so the learner can review exactly what they saw and every later action has a stable answer key. Never silently regenerate a question during a session. Treat generation quality, validation, and provenance as the crown jewels: retain the generator prompt/version, model, generation timestamp, and a content hash with every set.

**1.2 — The tutor is answer-keyed and constrained. It never free-reasons.**
A tutor that confidently walks a student down a wrong chain is worse than no tutor. The model must never be asked to solve the problem. It receives the validated, stored worked solution and hint ladder, the student's actual wrong answer, and the step they're stuck on — and its only job is to convert the next stored hint into a question tailored to the mistake they just made. Enforce this in the architecture, not the prompt:

- Every generated question must include a 3-rung hint ladder, a worked solution broken into discrete steps, and named common misconceptions. Generation fails if any are absent or invalid.
- The tutor's output is *validated* before display: it must not contain the final answer (numeric/symbolic comparison against the answer key, plus a check against the next-step value). On failure, retry once at temperature 0; on second failure, display the stored hint rung verbatim.
- Log every fallback. The fallback rate is a headline quality metric, not an edge case.
- Consequence worth internalising: **once a set is generated, it remains fully usable with the AI layer switched off.** Build the stored-hint path first and make it good. The tutor is a progressive enhancement over it. If generation is unavailable before a session starts, make that clear and do not substitute unverified filler content.

**1.3 — Generation must earn the word “premium.”**
One loose prompt is not a content pipeline. Generation must be staged: first create a set blueprint (topic boundaries, learning objectives, assumed prerequisites, difficulty distribution, and coverage plan), then generate structured questions against that blueprint, then run deterministic schema and answer checks plus a separate AI quality-review pass. Reject and regenerate failed items, up to a configured limit; never show a set that failed validation.

For quantitative topics, validate answers using the equivalence checker/CAS where possible and ensure the final worked-solution step agrees with the canonical answer. For qualitative topics, require a rubric, accepted-answer criteria, evidence/claim boundaries, and misconception-specific feedback; quality review must check factual consistency, ambiguity, duplicate concepts, and level fit. The interface should show a concise “set brief” so the learner can confirm or regenerate the scope before starting.

**1.4 — Hard cost ceilings on generation and tutoring.**
Route to a capable model for generation and independent review, with a cheaper model where it is demonstrably sufficient. Cache static system prompts and generated set artifacts. Enforce configurable per-set generation and per-session tutoring budgets, plus a per-user daily pause quota (default 5), all logged. Define target costs in config and print running estimated generation and tutoring cost in dev mode so the numbers are never a mystery.

**1.5 — Progression must have long-horizon structure, not just numbers going up.**
Gamification reliably produces a novelty spike that decays. XP, coins and ranks are table stakes and will not retain anyone past week three on their own. So the progression system needs at least one mechanic whose payoff sits weeks out and which is *tied to actual mastery*, not to time spent. Implement: ranks gated on **demonstrated accuracy at a difficulty tier**, not on cumulative XP. You cannot grind your way to Ronin by farming easy questions. Make the gate visible and legible from the first session.

**1.6 — Built to be clipped and shared.**
Paid acquisition does not work at this price point (comparable AU tutoring businesses pay ~A$199 per acquired student while losing money). Organic is the only channel. So the artifact needs to be screenshot-worthy and share-worthy from day one: a rank-up moment that is visually loud, a post-session summary card that is deliberately composed for a screenshot, and a shareable permalink for a completed session. This is a product requirement, not marketing polish. Build the summary card in this slice.

**1.7 — Instrument the risky hypotheses, not vanity metrics.**
Log events locally (JSONL is fine for the slice) for: session start/end, per-question latency, correct/incorrect, pause invoked, pause resolved-to-correct, hint rung reached, tutor fallback fired, rank-up, session abandoned mid-stream. The two questions this slice exists to answer are: *does the pause actually unstick people* (pause → next-attempt-correct rate) and *does the loop survive its own novelty* (session 1 vs session 5 length and voluntary return). Make both queryable from a single script.

**1.8 — A global leaderboard is a product direction, not a fake local feature.**
Eventually, a learner should be able to compete globally within any sufficiently specific topic — including “Fourier theory” — and become #1 for demonstrated mastery. This prototype does **not** build authentication, global persistence, or a leaderboard. It must, however, make the future path possible: normalize and retain the requested topic, set blueprint/version, question-set provenance, mastery evidence, and scoring rules. Rankings must be topic-scoped, mastery-weighted, resistant to easy-question farming, and only compare attempts against equivalent or calibrated difficulty. Do not claim a global rank until a server-backed, identity-aware system exists.

## 2. Scope of this build

**In:** one continuous playable experience — open topic request → AI-generated set brief and validation → Zen Mode grind → pause/tutor → resume → session summary card. Generated questions, XP, coins, ranks, streak-within-session, local persistence, and full 16-bit ronin presentation. The learner can request an arbitrary topic and level; provide suggested prompts only as examples, never as a closed catalog.

**Out (do not build):** auth, payments, subscriptions, user accounts, multi-device sync, global leaderboards, social features, an authoring admin UI, mobile apps, any B2B/classroom/teacher surface. If you find yourself building any of these, stop. Leave documented interfaces and data needed for the future leaderboard, but do not build its UI or call anything a global rank.

## 3. Stack

Default, unless you have a concrete reason to differ — say so first if you do:

- **[Next.js (App Router) + TypeScript + Tailwind]**, deployed-able to Vercel, single package.
- **[Persistence: IndexedDB via a thin typed wrapper — no backend database in this slice.]** Progress is local. Design the persistence layer behind an interface so a server-backed implementation drops in later without touching game logic.
- Server routes for set generation/review and tutoring so API keys stay server-side. Models are configurable via env; use a capable model for set generation/review and a small fast model for tutoring.
- Generated set content: structured JSON conforming to a shared Zod schema. Validate every set before it reaches the learner, then persist it locally with immutable provenance and a content hash. Put the schema, validators, generation prompts, and quality gates in the repo; do not rely on opaque model output or a database row as the only definition of a question.

## 4. Question schema

Design the schema yourself, but it must carry at minimum: stable id, normalized topic, subtopic, difficulty tier (1–5), the prompt (LaTeX-capable), answer type and canonical answer or rubric, an equivalence checker spec for objectively gradable answers (so `1/2`, `0.5` and `\frac{1}{2}` all pass, and so algebraic forms compare correctly), **an ordered worked solution or rubric-led explanation broken into discrete steps**, **a 3-rung stored hint ladder**, and 2–4 named common-misconception distractors with the wrong answer or response pattern each produces. At the set level, store the request, blueprint, generator/reviewer versions, validation results, and immutable provenance hash.

That last field matters more than it looks: it is what lets the tutor say something specific about *this* mistake without reasoning about the problem. Populate it properly.

Ship a `pnpm validate:content` script that validates saved generated sets, checks schema conformance, verifies every canonical answer against the final worked-solution step, flags missing hints/misconceptions/rubrics, and reports provenance. Run the same validation on every newly generated set before it can be played.

## 5. Generated content for this slice

Each session begins with a learner request: topic, optional subtopics or source material boundaries, and desired level. The system creates a balanced set with a stated number of questions and difficulty tiers 1–5 (more mass at tiers 2–3 unless the learner asks otherwise). It must work for quantitative and qualitative subjects, and be explicit when it cannot responsibly assess a request without more context.

Use calculus and linear algebra as acceptance fixtures, not as the product's only content: generate and validate a representative set for each, including chain rule, integration by parts, matrix multiplication, RREF, and eigenvalues. Where answers are computable, add tests asserting the answer key is correct (via a CAS check or hand-verified fixture). **Content errors are the fastest way to destroy trust in a product like this.**

## 6. The Zen loop

Continuous stream, not a quiz with a fixed end. Questions arrive one at a time from a selector that adapts on rolling accuracy: 3 correct in a row at a tier promotes; 2 wrong at a tier demotes.

Every problem has an allocated-time timer. The allocation is explicit before the learner starts, calibrated by difficulty and question type, and stored with the attempt so it can be used fairly in future mastery scoring. Make it feel like a ronin's focus gauge — a large, readable pixel-art sandglass/energy bar in the HUD with calm early-state animation, increasingly urgent visual and audio cues near expiry, and an unmistakable “time’s up” state. It must be game-like, tactile, and legible at a glance, not a generic web countdown.

Time expiration ends the current attempt and records it as unanswered/expired; it does not erase the question, deduct currency, shame the learner, or block them from pausing for the stored hint ladder and retrying. Award time-based bonuses only for correct answers and never let speed outweigh demonstrated accuracy. Respect `prefers-reduced-motion` by replacing pulses/shake with clear color and text state changes. The fantasy remains *focused calm under a clear challenge*, not punishment.

Feel matters as much as logic here:

- Instant, tactile feedback on answer submit. Chunky pixel-font damage numbers, a satisfying hit on correct, a soft non-punitive miss on wrong.
- Keyboard-first input. Enter submits, Enter advances. A learner should be able to run 30 questions without touching the mouse.
- A persistent HUD: XP bar, coin counter, current rank, session streak.
- A persistent, prominent per-question focus timer that shows the allocated time, remaining time, and the correct-answer speed bonus before submission. It must work with keyboard-first play and pause cleanly during a Socratic pause.
- Everything drawn at a consistent pixel grid, integer-scaled, with `image-rendering: pixelated`. No blurry upscaling — it reads as cheap immediately.
- CSS/SVG-drawn assets are fine; no third-party sprite packs with unclear licensing.
- One ambient loop and a small set of SFX, muted by default, toggleable, remembered.

Respect `prefers-reduced-motion` — cut screen shake and particles, keep the state changes.

## 7. The Socratic pause

Triggered manually by the learner ("I'm stuck") or offered after 2 consecutive wrong attempts on the same question. Entering the pause visibly changes the world state — the grind quiets down, the tutor arrives, and the per-question timer freezes. Leaving it drops you back mid-stream with the question intact and the remaining time restored.

The exchange is short by design: the tutor asks **one question at a time, two sentences maximum**, and the learner types a reply. Each turn advances at most one rung of the stored hint ladder. After rung 3, the tutor stops asking and reveals the worked solution step by step. **There is no infinite chat.** A learner who wants to argue with a chatbot has three free ones; ours exists to get them back into the grind.

Resuming after a pause: the question is re-presented fresh, and a correct answer earns reduced XP but no penalty framing. Getting unstuck is a win.

## 8. Build order

Work in this order and get each stage genuinely working before moving on:

1. Generated-set schema + validator + answer-equivalence checking with tests; build the blueprint, generation, review, rejection, and immutable local-save pipeline. Prove it with validated calculus and linear-algebra fixtures.
2. The Zen loop with stored generated hints only, no live tutor. Playable end to end.
3. Presentation pass — pixel HUD, feedback juice, sound, reduced-motion.
4. Progression: XP, coins, mastery-gated ranks, persistence.
5. The constrained tutor layer with output validation, fallback and cost logging.
6. Session summary card + shareable permalink.
7. Exercise the generator with a broad set of requested topics and levels; retain representative validated fixtures and verify all quantitative examples.
8. Analytics script answering the two §1.7 questions, plus generation acceptance/rejection rate, regeneration reasons, and cost per accepted set.

Commit at each stage. Keep a `DECISIONS.md` recording anything you chose that a future contributor would otherwise re-litigate.

## 9. Definition of done

- I can complete a 20-question session without touching the mouse, and it feels good.
- Each problem clearly communicates its allocated time; the focus timer is satisfying rather than stressful, freezes during a Socratic pause, and records expiry fairly.
- I can get stuck, pause, be genuinely helped without being handed the answer, and resume.
- `pnpm validate:content` passes for every saved generated set and every computable acceptance-fixture answer key is test-verified.
- After a set has been generated, pulling the API key out leaves it fully playable via its stored hints.
- Estimated generation and tutoring costs print in dev and stay within configured targets.
- The summary card is something I would actually screenshot.
- README explains the generation pipeline, quality gates, how to request a topic, and the planned leaderboard data contract. The analytics script answers: pause→correct rate, session-1 vs session-5 length, and generation quality/cost metrics.

Ask me about anything genuinely ambiguous before building. Do not ask permission to start.
