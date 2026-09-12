# Deploy: going public with the tutor

What must be true before this app is reachable at a public URL with a real
`ANTHROPIC_API_KEY` behind it. Work top to bottom. Step 1 is first because it
is the only item on this list that actually bounds how much money a bad day can
cost; everything after it reduces the chance of a bad day, but does not cap it.

Source of truth for the variable names and their missing-value behaviour:
`.env.example`. Design rationale: `docs/designs/zen-mode-vertical-slice.md`
constraint #9, "Deployment posture".

---

## 1. Set the provider spend cap (do this first)

The app has no server-side spend counter. Nothing in the codebase stops request
number 10,001. The cap in the Anthropic console is the whole guarantee.

1. Open the [Anthropic Console](https://console.anthropic.com/) and sign in as
   the account that owns the key you are about to deploy.
2. Go to **Settings** then **Limits** (billing and usage limits live here;
   exact label varies by account type and plan).
3. Set a **monthly spend limit** to a number you would be willing to lose
   outright. For a single-learner personal build, `$5` is already generous:
   at the default model the whole projected budget is about `$0.008` per pause
   and `$0.04` for a full five-pause day (numbers from
   `lib/tutor/config.ts`, see "What the cost model bounds" below). `$5` is
   roughly 125 days of maximum personal use, and a number that a scripted abuse
   run hits in minutes rather than hours.
4. Set the **email notification threshold** lower than the cap, e.g. `$1`, so
   the first signal is a warning and not a hard stop.
5. If the console offers it, scope a **workspace** to this app and put the key
   and the limit on that workspace, so a tutor incident cannot spend the budget
   of anything else on the account.

Write the number you chose here once it is set, so the next reader knows the
cap exists and what it is: `cap set to $____ on ____-__-__ by ____`.

**Verify:** the console shows the limit on the account or workspace that issued
the deployed key. There is no in-app way to confirm this. Do not rely on any
part of the app to tell you.

## 2. Create a key scoped to this deploy

Use a key you can revoke without breaking anything else. If the key in your
local `.env.local` is the same one you deploy, a leak means revoking your own
dev setup at the same moment you are trying to debug the leak.

**Verify:** `pnpm eval:tutor` runs green against the new key locally (it reads
`.env.local`, see `package.json`). ~22 fixtures, about `$0.017` a run.

## 3. Set the environment variables in the hosting provider

The target is Vercel (`docs/designs/zen-mode-vertical-slice.md` constraint #9).
In the project's **Settings** then **Environment Variables**, set these for the
**Production** environment, and separately for **Preview** if preview
deployments should have a working tutor:

| Variable | Value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | the key from step 2 | Server-side only. Never prefix it with `NEXT_PUBLIC_`. |
| `ZEN_TUTOR_ORIGIN` | the deployed origin, e.g. `https://zen-learner.vercel.app` | Scheme and host, no trailing slash, no path. |
| `NEXT_PUBLIC_ZEN_TUTOR_SECRET` | a random string, e.g. `openssl rand -hex 16` | Readable by every browser that loads the app. See step 5. |

Leave `ZEN_TUTOR_MODEL` unset so the default applies
(`lib/tutor/config.ts:79`).

Two traps:

- **Pick one secret variable, not both.** The route reads
  `ZEN_TUTOR_SHARED_SECRET` first and only falls through to
  `NEXT_PUBLIC_ZEN_TUTOR_SECRET` (`app/api/tutor/route.ts:74-75`). Setting both
  to different values means the server checks against one string while the
  browser sends the other, and every real request 403s into the authored hint
  ladder. Since the client can only ever read a `NEXT_PUBLIC_` name
  (`lib/tutor/useTutor.ts:94`), the `NEXT_PUBLIC_` one is the one to set.
- **`NEXT_PUBLIC_` values are baked in at build time.** Changing the secret
  requires a redeploy, not a restart. If you rotate it, redeploy before
  expecting the new value to take effect.

**Verify:** redeploy after setting them. Environment variable changes on Vercel
apply to the next build, not to the running one.

## 4. Per-environment: decide what Preview gets

A preview deployment has a different origin from production. If you set
`ZEN_TUTOR_ORIGIN` to the production origin and leave it at that, previews get
403s on every tutor request and fall to the authored ladder. That is an
acceptable outcome. The other acceptable outcome is no `ANTHROPIC_API_KEY` in
Preview at all, which produces the `not-configured` fallback
(`app/api/tutor/route.ts:140`) and costs nothing. Pick one deliberately. What
you do not want is a preview URL with a live key and no origin set, which is a
second unguarded public endpoint on the same budget.

## 5. Understand what the origin check and the secret are, and are not

They are convenience guards. The route says so itself
(`app/api/tutor/route.ts:62-68`), and so does the design doc: "A secret shipped
in a client bundle is discoverable, so the spend cap is the actual guarantee,
not the secret."

Concretely:

- **The secret is public.** `NEXT_PUBLIC_ZEN_TUTOR_SECRET` is inlined into the
  JavaScript bundle by Next.js and shipped to every browser that opens the app.
  Anyone can read it in devtools, in the network tab, or in the built JS. It
  stops a script that does not bother to look. It stops nothing that does.
- **The origin check accepts a missing `Origin` header.**
  `app/api/tutor/route.ts:83` returns true when the header is absent, because a
  same-origin `fetch` omits it on some browsers. A server-to-server client that
  simply sends no `Origin` passes this check even with `ZEN_TUTOR_ORIGIN` set.
- **Both fail open when unset.** No secret configured means the check is skipped
  entirely (`app/api/tutor/route.ts:76`). No origin configured means every
  origin is allowed (`app/api/tutor/route.ts:79`). Neither logs anything in
  production, so a deploy that forgot them looks exactly like a deploy that has
  them.

Treat the pair as friction, not as authentication. Nothing downstream should be
designed on the assumption that a request reaching `/api/tutor` came from your
app.

## 6. Verify the guards are actually live, not silently no-ops

Because both guards fail open with no log, "I set the variable" and "the guard
is running" are different claims. Check the second one from a terminal.

Substitute your deployed host. `$SECRET` is the value you set in step 3; it is
public, so there is nothing to protect in typing it here.

**a. A foreign origin is rejected.** Expect `403` and
`{"error":"not allowed"}`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://YOUR-HOST/api/tutor \
  -H 'content-type: application/json' \
  -H 'origin: https://evil.example' \
  -H "x-zen-tutor: $SECRET" \
  -d '{}'
```

A `403` proves `ZEN_TUTOR_ORIGIN` is set and being read. A `400` means the
origin check passed and the body validator rejected the empty object instead,
which means `ZEN_TUTOR_ORIGIN` is not set in this environment.

**b. A missing or wrong secret is rejected.** Expect `403`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://YOUR-HOST/api/tutor \
  -H 'content-type: application/json' \
  -H 'origin: https://YOUR-HOST' \
  -H 'x-zen-tutor: definitely-not-the-secret' \
  -d '{}'
```

Again, `403` means the guard is live; `400` means no secret is configured
server-side.

**c. The correct origin plus the correct secret gets past the guards.** Expect
`400` here, not `200`: the empty body is deliberately invalid, so a `400` with
`{"error":"request did not validate"}` is the success signal. It proves the
request cleared `isAllowed` and reached the schema
(`app/api/tutor/route.ts:127-133`) without spending anything at the provider.

```bash
curl -s -X POST https://YOUR-HOST/api/tutor \
  -H 'content-type: application/json' \
  -H 'origin: https://YOUR-HOST' \
  -H "x-zen-tutor: $SECRET" \
  -d '{}'
```

**d. The tutor actually works in the app.** Open the deployed URL, play until a
pause, and trigger a hint. A rewritten, mistake-specific hint means the key is
live. A generic hint that matches the authored ladder text means something in
the chain returned `ok: false`, which is a degraded tutor and not a broken app
(`app/api/tutor/route.ts:19-26`). Every failure path returns `200`, so an
uptime check will not tell you this. The only way to notice is to look, or to
watch the provider console for requests that never arrive.

**e. A summary permalink opens for someone who is not you.** The app deploys
publicly specifically so shared links open
(`docs/designs/zen-mode-vertical-slice.md` constraint #6). Open one in a
private window.

## 7. Platform rate limiting

The design doc lists platform rate limiting as part of the posture. Vercel's
firewall and rate-limiting rules are configured in the project dashboard, not
in this repo. Scope any rule to the `/api/tutor` path rather than the whole
site, so the grind and the permalinks stay unthrottled. This is a nice-to-have
next to step 1; a rate limit slows a single abusive client, while the spend cap
bounds every client at once.

---

## What the cost model bounds, and what it does not

`lib/tutor/config.ts` is a real budget, and it is worth knowing precisely how
far it reaches, because the parts it does not cover are exactly what the spend
cap is for.

**It bounds, at build and test time:**

- **Output length per request.** `maxOutputTokens` (`lib/tutor/config.ts:217`)
  derives the cap from the headroom the `$0.03` ceiling leaves after the assumed
  input, then clamps it to 600 tokens. That cap is sent on every provider call
  (`app/api/tutor/route.ts:159`), so no single reply can run away.
- **Model choice.** `rateCard` throws on a model with no published rate card
  (`lib/tutor/config.ts:88`), so `ZEN_TUTOR_MODEL` cannot point the tutor at
  something unbudgeted.
- **The projection, checked by tests.** `lib/tutor/config.test.ts` asserts every
  card in `RATE_CARDS` stays under `COST_CEILING_PER_PAUSE` per request, for a
  3-rung pause, and at the output cap. A model swap or a system prompt that
  doubles fails `pnpm test` rather than the invoice.
- **Honest caching accounting.** `cachingApplies` (`lib/tutor/config.ts:142`)
  reports that no priced model can cache a ~369-token prefix, so the budget
  claims no saving it will not get.

**It does not bound:**

- **Requests per learner, server-side.** `DAILY_PAUSE_QUOTA = 5`
  (`lib/tutor/config.ts:100`) is enforced entirely in the browser, against the
  device's own clock, out of client-side storage (`lib/tutor/quota.ts`, and its
  own comment says the real bound is the spend cap). `app/api/tutor/route.ts`
  never reads a quota. A caller that does not run the app is not subject to it.
- **Requests in total.** No counter, no accumulator, no cutoff anywhere on the
  server. The route will serve request one million as cheerfully as request one.
- **Spend visibility in production.** `logDev` returns immediately unless
  `NODE_ENV === "development"` (`app/api/tutor/route.ts:234`), and `costUsd` is
  stripped from the response outside development
  (`app/api/tutor/route.ts:219`). In production the app reports nothing about
  what it spent. The provider console is the only meter.
- **The retry.** A leaked first reply triggers a second call
  (`app/api/tutor/route.ts:180`), so any rung can cost twice what the projection
  assumes. Worked through at the 600-token output cap, a 3-rung pause where
  every rung leaks and retries is 6 requests: about `$0.027` on the default
  `claude-haiku-4-5`, which lands just under the `$0.03` ceiling, and about
  `$0.054` on `claude-sonnet-5`, which is 1.8x over it. The tests in
  `lib/tutor/config.test.ts` multiply by `MAX_RUNG` but not by the retry, so
  they do not catch this. Practical consequence for a deploy: leave
  `ZEN_TUTOR_MODEL` unset.

Read together: the app bounds the cost of a well-behaved pause. The provider
cap bounds everything else. Step 1 is not paperwork.
