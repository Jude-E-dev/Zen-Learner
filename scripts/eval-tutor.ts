import { readFileSync, writeFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";

import { loadAll } from "../lib/content/load";
import {
  costOf,
  maxOutputTokens,
  modelId,
  projectedCost,
  rateCard,
  COST_CEILING_PER_PAUSE,
  type Usage,
} from "../lib/tutor/config";
import { runChecks, type CheckOutcome } from "../lib/tutor/eval/checks";
import { buildFixtures, type Fixture } from "../lib/tutor/eval/fixtures";
import { SYSTEM_PROMPT, buildUserMessage } from "../lib/tutor/prompt";

/**
 * The tutor eval (design doc #12), run against the real model.
 *
 * This costs actual money — one request per fixture — so it is a script you
 * run deliberately rather than part of `pnpm test`. The checks themselves are
 * unit-tested offline in lib/tutor/eval/checks.test.ts; what this adds is the
 * only thing that cannot be faked: whether the model, on this prompt, actually
 * behaves.
 *
 *   pnpm eval:tutor                every fixture
 *   pnpm eval:tutor --dry          print the fixtures and the bill, ask nothing
 *   pnpm eval:tutor --only=id      one fixture, for iterating on a failure
 *   pnpm eval:tutor --save=f.json  keep the replies
 *   pnpm eval:tutor --replay=f.json  re-check saved replies, spending nothing
 *
 * `--replay` is what makes tuning the checks affordable. The replies are the
 * expensive half and they do not change when a check does, so iterating on the
 * validator against a saved run costs nothing — and, more importantly, holds
 * the model's output fixed while the checker moves, which is the only way to
 * tell a real fix from a lucky sample.
 */

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

const MARK: Record<CheckOutcome, string> = {
  pass: `${GREEN}✓${RESET}`,
  warn: `${YELLOW}!${RESET}`,
  fail: `${RED}✗${RESET}`,
};

function heading(text: string) {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

  const pool = loadAll().flatMap((f) => f.questions);
  let fixtures = buildFixtures(pool);
  if (only) fixtures = fixtures.filter((f) => f.id.includes(only));

  if (fixtures.length === 0) {
    console.error(`No fixtures matched${only ? ` "${only}"` : ""}.`);
    process.exit(1);
  }

  const model = modelId();
  const card = rateCard(model);
  const estimate = projectedCost(card).cold * fixtures.length;

  const replayPath = args.find((a) => a.startsWith("--replay="))?.slice("--replay=".length);
  const savePath = args.find((a) => a.startsWith("--save="))?.slice("--save=".length);
  const replayed: Record<string, string> | null = replayPath
    ? (JSON.parse(readFileSync(replayPath, "utf8")) as Record<string, string>)
    : null;
  const saved: Record<string, string> = {};

  heading(`TUTOR EVAL — ${fixtures.length} fixtures against ${model}`);
  console.log(
    `${DIM}Estimated cost $${estimate.toFixed(4)} ` +
      `(~$${projectedCost(card).cold.toFixed(5)} per fixture, ceiling $${COST_CEILING_PER_PAUSE} per pause)${RESET}`,
  );

  if (dry) {
    console.log(`\n${DIM}--dry: nothing sent.${RESET}\n`);
    for (const f of fixtures) console.log(`  ${f.id}\n    ${DIM}${f.probes}${RESET}`);
    return;
  }

  if (!replayed && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\nANTHROPIC_API_KEY is not set. The eval needs a real key — that is the " +
        "whole point of it. Put one in .env.local, or run with --dry.",
    );
    process.exit(1);
  }

  const client = new Anthropic();
  if (replayed) console.log(`${DIM}--replay: ${replayPath}, spending nothing.${RESET}`);
  let spent = 0;
  let failed = 0;
  let warned = 0;
  const failuresByCheck: Record<string, number> = {};

  for (const fixture of fixtures) {
    let reply: string;
    if (replayed) {
      if (!(fixture.id in replayed)) continue;
      reply = replayed[fixture.id];
    } else {
      const result = await ask(client, model, card, fixture);
      reply = result.reply;
      spent += costOf(result.usage, card);
      saved[fixture.id] = reply;
    }

    const verdict = runChecks(
      reply,
      fixture.question,
      fixture.rung,
      fixture.misconceptionId,
    );
    if (verdict.failed) failed += 1;
    else if (verdict.warned) warned += 1;

    const marks = verdict.checks.map((c) => `${MARK[c.outcome]}${c.name}`).join(" ");
    console.log(`\n${marks}  ${DIM}${fixture.id}${RESET}`);
    console.log(`  ${DIM}${fixture.probes}${RESET}`);
    console.log(`  ${reply.replace(/\n/g, "\n  ")}`);

    for (const check of verdict.checks) {
      if (check.outcome === "pass") continue;
      failuresByCheck[check.name] = (failuresByCheck[check.name] ?? 0) + 1;
      const colour = check.outcome === "fail" ? RED : YELLOW;
      console.log(`  ${colour}${check.name}: ${check.detail}${RESET}`);
    }
  }

  if (savePath) {
    writeFileSync(savePath, `${JSON.stringify(saved, null, 2)}\n`);
    console.log(`\n${DIM}saved ${Object.keys(saved).length} replies to ${savePath}${RESET}`);
  }

  heading("RESULT");
  const passed = fixtures.length - failed - warned;
  console.log(
    `  ${GREEN}${passed} clean${RESET} · ${YELLOW}${warned} warned${RESET} · ${RED}${failed} failed${RESET}` +
      `  ${DIM}of ${fixtures.length}${RESET}`,
  );
  console.log(`  ${DIM}spent $${spent.toFixed(4)}${RESET}`);

  const perFixture = spent / fixtures.length;
  if (!replayed && perFixture > COST_CEILING_PER_PAUSE) {
    console.log(
      `  ${RED}$${perFixture.toFixed(5)} per pause is over the $${COST_CEILING_PER_PAUSE} ceiling.${RESET}`,
    );
  }

  const breakdown = Object.entries(failuresByCheck).sort(([, a], [, b]) => b - a);
  if (breakdown.length > 0) {
    console.log(`\n  ${DIM}by check:${RESET}`);
    for (const [name, count] of breakdown) console.log(`    ${name.padEnd(12)}${count}`);
  }

  console.log();
  // Warnings are for a person to read; only a hard failure fails the run.
  process.exit(failed > 0 ? 1 : 0);
}

async function ask(
  client: Anthropic,
  model: string,
  card: ReturnType<typeof rateCard>,
  fixture: Fixture,
): Promise<{ reply: string; usage: Usage }> {
  const message = await client.messages.create({
    model,
    max_tokens: maxOutputTokens(card),
    // Temperature 0, so a failure is reproducible and two runs are
    // comparable. Production runs warmer on the first attempt; what is being
    // evaluated here is the prompt, not the sampling.
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          question: fixture.question,
          rung: fixture.rung,
          wrongAnswer: fixture.wrongAnswer,
          misconceptionId: fixture.misconceptionId,
        }),
      },
    ],
  });

  const reply = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    reply,
    usage: {
      inputTokens: message.usage.input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      outputTokens: message.usage.output_tokens,
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
