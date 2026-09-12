# Zen Learner

A 16-bit-styled math practice app. Pick a topic, grind authored calculus
questions, earn XP, climb mastery-gated ranks, and when you get stuck, pause
into a tightly constrained Socratic tutor that nudges you toward the answer
without ever stating it.

Next.js (App Router) + TypeScript + Tailwind. Single package, no database, no
accounts. Progress lives in the browser.

## Run it

```bash
pnpm install
pnpm dev          # validates content, then starts the dev server
```

Open `http://localhost:3000`. The grind is at `/play`.

No API key is needed to run the app. The authored hint ladder is the real
product and the AI tutor is a layer on top of it, so the whole thing is
playable with the tutor switched off.

## Tests

```bash
pnpm test         # vitest run
pnpm test:watch
```

Test files live next to their source as `*.test.ts`.

## Layout

| Path | What it holds |
|---|---|
| `content/*.yaml` | The question bank: answers, 3-rung hint ladders, worked solutions, misconception distractors. Schema-validated at build time; the build fails on invalid content. |
| `lib/equivalence/` | Answer checking by behaviour rather than spelling: parse with `mathjs`, evaluate at sample points, compare. |
| `lib/game/` | The grind loop, difficulty tiers, promote/demote state machine. |
| `lib/tutor/` | Model config and rate cards, the prompt, the leak validator, the daily pause quota. |
| `app/api/tutor/` | The only server component. Exists so the API key never reaches the browser. |
| `app/play/`, `app/summary/` | The session and its shareable summary permalink. |
| `docs/designs/` | The design doc. Read it before changing behaviour; most of what looks arbitrary is decided there. |

## The tutor

`/api/tutor` takes the question, the authored worked solution, the hint rung,
and the learner's wrong answer, and returns a two-sentence nudge. Model output
is scanned for the answer; a leak triggers one retry at temperature 0 and then
falls back to the raw authored hint. Every failure path returns `200` with the
authored hint, because a fallback is a normal outcome the pause renders, not an
error the client has to catch.

There is a hard cost ceiling of US$0.03 per pause, priced out in
`lib/tutor/config.ts` and enforced by `lib/tutor/config.test.ts` — including the
worst case, where all three rungs leak and each one is retried. The default
model holds at $0.027. `claude-sonnet-5` does not, which is why
`ZEN_TUTOR_MODEL` should stay unset (see TODOS.md).

```bash
pnpm eval:tutor   # ~22 fixtures against the live model, needs a real key
pnpm analytics <file.jsonl>
```

## Configuration

Copy `.env.example` to `.env.local` and fill in what you want. Every variable is
optional and each one documents what happens when it is missing.

For local dev you only need `ANTHROPIC_API_KEY`, and only if you want the AI
tutor rather than the authored ladder.

## Deploying

**Read [`docs/deploy.md`](docs/deploy.md) before this goes public.** The short
version: set a spend cap in the Anthropic console first, because the app has no
server-side spend counter and that cap is the only real bound on worst-case
loss. The origin check and shared secret on `/api/tutor` are convenience
guards, not authentication, and both fail open and silently when unset.
