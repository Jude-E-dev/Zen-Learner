#!/usr/bin/env tsx
/**
 * Content gate. `pnpm build` runs this first and fails on any error, so invalid
 * content can never reach a running app.
 *
 * Schema conformance is the easy half. The half that actually protects the
 * learner is semantic:
 *   - the answer key must agree with the worked solution's own final step
 *   - every accepted alternate form must really be equivalent to the answer key
 *   - no "wrong answer" distractor may secretly be correct
 *
 * A content error here is worse than a code bug: the app confidently tells a
 * learner their correct answer is wrong, and they believe it.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ContentError, loadAll } from "../lib/content/load";
import { compareAnswers } from "../lib/equivalence/check";
import type { Question } from "../lib/content/schema";

const OUT = join(process.cwd(), "lib", "content", "generated.json");

const errors: string[] = [];
const warnings: string[] = [];

function checkQuestion(path: string, q: Question) {
  const where = `${path} [${q.id}]`;
  const opts = { answerType: q.answerType, variables: q.variables };

  // The answer key must be parseable, or grading cannot work at all.
  if (compareAnswers(q.canonicalAnswer, q.canonicalAnswer, opts) !== "agree") {
    errors.push(`${where}: canonicalAnswer "${q.canonicalAnswer}" is not self-consistent (it failed to parse or evaluate)`);
    return;
  }

  // The worked solution must actually arrive at the stated answer.
  const last = q.workedSolution[q.workedSolution.length - 1];
  if (!last.result) {
    errors.push(`${where}: the final worked-solution step needs a "result" so it can be checked against the answer key`);
  } else {
    const agreement = compareAnswers(last.result, q.canonicalAnswer, opts);
    if (agreement === "disagree") {
      errors.push(`${where}: final worked step gives "${last.result}" but canonicalAnswer is "${q.canonicalAnswer}"`);
    } else if (agreement === "undetermined") {
      warnings.push(`${where}: could not verify the final worked step against the answer key`);
    }
  }

  // An accepted form that isn't equivalent would wrongly mark answers correct.
  for (const form of q.acceptedForms) {
    const agreement = compareAnswers(form, q.canonicalAnswer, opts);
    if (agreement === "disagree") {
      errors.push(`${where}: acceptedForm "${form}" is not equivalent to the answer key`);
    } else if (agreement === "undetermined") {
      warnings.push(`${where}: could not verify acceptedForm "${form}"`);
    }
  }

  // A distractor that is actually correct would mark a right answer wrong —
  // the worst failure this system has.
  for (const m of q.misconceptions) {
    if (compareAnswers(m.wrongAnswer, q.canonicalAnswer, opts) === "agree") {
      errors.push(`${where}: misconception "${m.id}" has wrongAnswer "${m.wrongAnswer}" which is EQUIVALENT to the correct answer`);
    }
  }
}

function main() {
  let files;
  try {
    files = loadAll();
  } catch (err) {
    if (err instanceof ContentError) {
      console.error(`\n✗ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const seen = new Map<string, string>();
  const all: Question[] = [];

  for (const file of files) {
    for (const q of file.questions) {
      const prior = seen.get(q.id);
      if (prior) {
        errors.push(`${file.path} [${q.id}]: duplicate id, already defined in ${prior}`);
        continue;
      }
      seen.set(q.id, file.path);
      checkQuestion(file.path, q);
      all.push(q);
    }
  }

  const byTier = new Map<number, number>();
  for (const q of all) byTier.set(q.tier, (byTier.get(q.tier) ?? 0) + 1);

  console.log(`\nContent: ${all.length} questions across ${files.length} file(s)`);
  console.log(
    `Tiers:   ${[1, 2, 3, 4, 5].map((t) => `T${t}:${byTier.get(t) ?? 0}`).join("  ")}`,
  );

  for (const w of warnings) console.warn(`⚠ ${w}`);

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} content error(s):\n`);
    for (const e of errors) console.error(`  ${e}`);
    console.error("");
    process.exit(1);
  }

  writeFileSync(OUT, `${JSON.stringify(all, null, 2)}\n`);
  console.log(`✓ content valid — wrote ${OUT.replace(process.cwd() + "/", "")}\n`);
}

main();
