import { compareAnswers } from "../equivalence/check";
import type { Question } from "../content/schema";

/**
 * Did the tutor just give the answer away?
 *
 * The tutor's reply is prose, so it cannot be handed to the equivalence
 * checker directly. This pulls candidate maths out of the prose — LaTeX spans,
 * digit runs, symbol sequences — normalizes the number-words people write when
 * they are spelling an answer out ("one over x squared"), and compares each
 * fragment against the answer key with the same checker that grades learners.
 *
 *     reply ──► extract fragments ──► normalize words ──► compareAnswers
 *                                                            │
 *                        agree ──────────────────────────────┤──► LEAK
 *                        undetermined ───────────────────────┤──► SUSPECT
 *                        disagree ───────────────────────────┴──► clean
 *
 * A fragment the checker cannot resolve counts as suspicious rather than clean,
 * because the failure we care about is a leak we did not recognise. The cost of
 * a false positive is one retry; the cost of a false negative is handing over
 * the answer the learner was about to work out.
 *
 * That paranoia has to be aimed, though. "Unparseable therefore suspicious",
 * applied literally, fired on about two in five replies from a clean eval run
 * — ordinary mathematical prose is full of things that do not parse — so the
 * tutor would have been switched off most of the time by its own safety net.
 * `couldBeTheAnswer` below is the gate that keeps the suspicion and drops the
 * noise: quoted problem text, Leibniz notation, and fragments that share
 * nothing with the answer are not candidates for being it.
 *
 * The residual risk is stated in the design doc rather than papered over: a
 * leak phrased entirely in prose with no extractable fragment is caught by
 * prevention (the system prompt forbids it) and by eval fixtures probing for
 * exactly that, not by this function. A runtime LLM judge would catch it and
 * roughly double the per-pause cost, which is a ceiling that was chosen
 * deliberately.
 */

export type LeakVerdict = "clean" | "leaked" | "suspect";

export interface LeakReport {
  verdict: LeakVerdict;
  /** The fragment that tripped it, for the dev log and the eval output. */
  offending?: string;
  fragments: string[];
}

/**
 * Number-words, so "one over x squared" is comparable with "1/x^2".
 *
 * Only the forms that show up when someone reads an expression aloud. This is
 * not a general English-to-maths parser and should not grow into one; the job
 * is to make a spelled-out answer parseable, not to understand a sentence.
 */
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};

const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const WORD_NUMBERS: Record<string, string> = Object.fromEntries(
  Object.entries({ ...UNITS, ...TEENS, ...TENS }).map(([w, n]) => [w, String(n)]),
);

const WORD_OPERATORS: [RegExp, string][] = [
  [/\bdivided by\b/gi, "/"],
  [/\bover\b/gi, "/"],
  [/\btimes\b/gi, "*"],
  [/\bmultiplied by\b/gi, "*"],
  [/\bplus\b/gi, "+"],
  [/\bminus\b/gi, "-"],
  [/\bnegative\b/gi, "-"],
  [/\bsquared\b/gi, "^2"],
  [/\bcubed\b/gi, "^3"],
  [/\bto the power of\b/gi, "^"],
  [/\bsquare root of\b/gi, "sqrt"],
];

/**
 * Turn spelled-out maths into something mathjs can parse.
 *
 * Deliberately mechanical: word operators first, then word numbers, then
 * whitespace. "one over x squared" becomes "1/x^2", which the checker can
 * compare. Anything it cannot convert stays as prose and fails to parse
 * later, which routes it to "suspect" rather than "clean".
 */
export function normalizeWords(text: string): string {
  let out = text;
  for (const [pattern, replacement] of WORD_OPERATORS) {
    out = out.replace(pattern, replacement);
  }

  /*
   * Compound tens before single words, or "thirty seven" becomes "30 7" —
   * two numbers instead of one, and a leaked two-digit answer walks straight
   * past the comparison. Mental-math answers are mostly two digits, so this
   * is the common case rather than an exotic one.
   */
  const tensWords = Object.keys(TENS).join("|");
  const unitWords = Object.keys(UNITS).slice(1).join("|");
  out = out.replace(
    new RegExp(`\\b(${tensWords})[\\s-]+(${unitWords})\\b`, "gi"),
    (_full, tens: string, units: string) =>
      String(TENS[tens.toLowerCase()] + UNITS[units.toLowerCase()]),
  );

  out = out.replace(/\b[a-z]+\b/gi, (word) => {
    const digit = WORD_NUMBERS[word.toLowerCase()];
    return digit ?? word;
  });

  // Canonical spacing, so the output is comparable and not merely parseable.
  return out
    .replace(/\s*([+\-*/^])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip the LaTeX a model reaches for when it writes maths in prose. */
function stripLatex(fragment: string): string {
  return (
    fragment
      .replace(/\\left|\\right/g, "")
      .replace(/\\dfrac|\\tfrac|\\frac/g, "frac")
      .replace(/\\cdot|\\times/g, "*")
      .replace(/\\sqrt/g, "sqrt")
      /*
       * Function names survive as themselves.
       *
       * The catch-all below turns any remaining `\command` into a space, which
       * silently ate `\cos` and left `cos(y)` as a bare `(y)` — a different
       * expression that then failed to resolve and was reported as suspicious.
       * mathjs knows all of these by their bare names, so unwrapping is both
       * more accurate and more parseable.
       */
      .replace(
        /\\(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp|min|max|abs)\b/g,
        "$1",
      )
      .replace(/[{}]/g, " ")
      .replace(/\\[a-zA-Z]+/g, " ")
      .replace(/\s+/g, " ")
      /*
       * Braces become spaces above, so `x^{2}` lands as `x^ 2` — which does not
       * parse, and an unparseable fragment used to mean a retry. Rejoining the
       * operator with its operand is the difference between comparing `x^2`
       * against the answer and giving up on it.
       */
      .replace(/([\^_])\s+/g, "$1")
      .trim()
  );
}

/**
 * Drop the `dx` that closes an integral.
 *
 * Applied after `expandFrac`, not inside `stripLatex`, and the order is the
 * whole point: `\frac{dy}{dx}` flattens to `frac dy dx`, so stripping the
 * trailing differential first left `frac dy` — a fraction missing its
 * denominator, which then failed to expand and compared as nothing at all.
 */
function dropTrailingDifferential(text: string): string {
  return text.replace(/\s*\bd[a-z]\s*$/i, "").trim();
}

/** `frac a b` (from \frac{a}{b}) into `(a)/(b)`, which mathjs understands. */
function expandFrac(text: string): string {
  return text.replace(/frac\s*([^\s]+)\s+([^\s]+)/g, "($1)/($2)");
}

/**
 * Split a fragment on relations, and keep the sides.
 *
 * A model writes `dy/dx = -x/y`, which is a statement rather than a value.
 * Treated whole it does not parse, and an unparseable fragment counts as
 * suspicious — so the most natural way to phrase a hint was also the most
 * likely to be flagged. Splitting is strictly better in both directions: the
 * notation half drops out, and the half that might actually be the answer
 * gets compared properly instead of being lumped into "could not tell".
 */
function splitOnRelations(fragment: string): string[] {
  return fragment
    .split(/[=<>≤≥≈~]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Pull every span that might be maths out of the reply.
 *
 * Three sources, because a model writes maths three ways: inside `$...$` or
 * `\(...\)`, as a bare symbolic run like `15(3x+1)^4`, and as words. Each
 * candidate is kept whole rather than split, since "3x" and "+1" mean nothing
 * apart.
 */
export function extractFragments(reply: string, question?: Question): string[] {
  const found: string[] = [];

  // 1. Explicit maths delimiters.
  for (const match of reply.matchAll(/\$([^$]{1,120})\$/g)) {
    found.push(dropTrailingDifferential(expandFrac(stripLatex(match[1]))));
  }
  for (const match of reply.matchAll(/\\\(([\s\S]{1,120}?)\\\)/g)) {
    found.push(dropTrailingDifferential(expandFrac(stripLatex(match[1]))));
  }
  for (const match of reply.matchAll(/\\\[([\s\S]{1,120}?)\\\]/g)) {
    found.push(dropTrailingDifferential(expandFrac(stripLatex(match[1]))));
  }

  /*
   * Runs of maths, from the prose twice over: once as written, and once after
   * number-words are converted. Doing both with the same pass means a spelled
   * out answer and a typed one take the same path, and neither keeps the
   * surrounding words — "It is one over x squared" has to yield "1/x^2", not
   * "It is 1/x^2", because the second does not parse and a fragment that does
   * not parse is only ever "suspect".
   */
  const plain = reply.replace(/\$[^$]*\$/g, " ");
  for (const source of [plain, normalizeWords(plain)]) {
    for (const match of source.matchAll(/[0-9a-zA-Z_.()^*/+\-]{1,80}/g)) {
      const candidate = match[0].replace(/^[.\s]+|[.\s]+$/g, "").trim();
      if (candidate.length === 0) continue;
      /*
       * Drop bare identifiers, but not the answer itself.
       *
       * This used to require a digit, which quietly made every digit-free
       * answer undetectable in plain prose — `-x/y`, `ln(ln(x))` and `-tan(x)`
       * are all answers in the bank, and "so you get -x/y" sailed through as
       * clean. What the rule was reaching for is that a lone word like "you"
       * is not an answer; a lone word that *is* the answer plainly is.
       */
      const bareWord = /^[a-z]+$/i.test(candidate);
      if (
        bareWord &&
        candidate.toLowerCase() !== question?.canonicalAnswer.trim().toLowerCase()
      ) {
        continue;
      }
      if (/^[.\-+*/^()]+$/.test(candidate)) continue;
      found.push(candidate);
    }
  }

  /*
   * Relations are split here rather than filtered, so `dy/dx = -x/y` becomes
   * two candidates. Deciding which of them could be the answer is not this
   * function's job — it has no question to compare against — and doing it here
   * anyway is how a filter ends up hiding a leak it was never told about.
   * `couldBeTheAnswer` makes that call, once, with the answer in hand.
   */
  const split = found.flatMap(splitOnRelations);
  return [...new Set(split.map((f) => f.trim()).filter((f) => f.length > 0))];
}

/**
 * Could this fragment be the answer in disguise?
 *
 * The gate on `suspect`, and the difference between a validator and a nuisance.
 * "Unparseable therefore suspicious" sounds appropriately paranoid and is not:
 * measured against real replies it fired on roughly two in five, because
 * ordinary mathematical prose is full of things that do not parse — `1^\infty`,
 * `0/0`, a half-written step. Every one of those became a retry and then a
 * fallback to the authored hint, so the tutor would have been switched off most
 * of the time by its own safety net.
 *
 * So `suspect` now means what it says: this might be the answer and the checker
 * could not tell. Two things rule a fragment out, and neither weakens detection
 * of a real leak:
 *
 *   - **The answer is a number and the fragment cannot be one.** A numeric
 *     answer can only be leaked by something that evaluates to a number. A
 *     fragment with no digit in it is not a disguised `2`.
 *   - **The fragment shares no symbol with the answer.** An expression cannot
 *     be leaked by a fragment with none of its variables or constants in it.
 *
 * A fragment that clears both is still suspicious, and still routes to the
 * retry — the paranoia is kept, just aimed.
 */
/** Symbols and numbers, for cheap comparison of what two strings mention. */
function symbolsIn(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+|[0-9]+/g) ?? []);
}

/**
 * Is this fragment quoted from the question itself?
 *
 * A tutor that says "what do you get when you factor $x^2 - 4$?" has restated
 * part of the problem, not revealed its answer — and `x^2 - 4` is sitting in
 * the prompt for anyone to read. Flagging it treats the question as though it
 * were a secret.
 *
 * Only the prompt is exempt. The worked solution is deliberately not, because
 * its final step *is* the answer, and the reveal walking one step too far is
 * exactly the leak worth catching.
 */
function quotedFromQuestion(fragment: string, question: Question): boolean {
  const normalize = (text: string) =>
    text.toLowerCase().replace(/[\s{}()\\$]/g, "");
  const needle = normalize(fragment);
  if (needle.length < 2) return false;
  return normalize(question.prompt).includes(needle);
}

function couldBeTheAnswer(fragment: string, question: Question): boolean {
  const answer = question.canonicalAnswer;

  // Quoting the problem is not revealing its answer.
  if (quotedFromQuestion(fragment, question)) return false;

  /*
   * Extraction artifacts are not candidates.
   *
   * The scanner walks prose with a character-class regex, so it happily emits
   * `1)` from the tail of `(3x+1)` and `f'(x)` from a sentence about notation.
   * Neither is an expression; the first is a fragment of one and the second
   * names a function rather than giving its value. Both were reported as
   * suspicious purely because they failed to parse.
   */
  const parens = (fragment.match(/\(/g)?.length ?? 0) - (fragment.match(/\)/g)?.length ?? 0);
  if (parens !== 0) return false;
  // Prime notation — f'(x), y'' — is a name for a derivative, not its value.
  if (/['′]/.test(fragment) && !/['′]/.test(answer)) return false;

  /*
   * A fragment carrying Leibniz notation cannot be an answer that does not.
   *
   * "gather the dy/dx terms" and "cos(y)·dy/dx + 2x" are the natural way to
   * talk through an implicit-differentiation problem, and they parse as
   * expressions in unknown variables — so they resolve to "could not tell" and
   * were reported as suspicious on nearly every implicit question.
   *
   * Derived from the answer rather than asserted about the bank: no current
   * answer uses this notation, but if one ever does, the guard turns itself
   * off for that question instead of hiding a real leak.
   */
  const leibniz = /\bd[a-z]\b/i;
  if (leibniz.test(fragment) && !leibniz.test(answer)) return false;

  if (question.answerType === "number") {
    // Needs a digit or a named constant to stand a chance of being a number.
    if (!/[0-9]/.test(fragment) && !/\b(e|pi)\b/i.test(fragment)) return false;
  }

  const answerSymbols = symbolsIn(answer);
  if (answerSymbols.size === 0) return true;

  const fragmentSymbols = symbolsIn(fragment);

  /*
   * A fragment naming something the answer never mentions is a different
   * expression.
   *
   * `-x/y` is not `-25/y^3`, and `sin(u)` is not an answer with no `u` in it —
   * both are working, and both were reported as suspicious only because a free
   * variable makes an expression impossible to evaluate. This is safe to apply
   * because it gates `undetermined` alone: a fragment that actually resolves to
   * the answer is caught as `leaked` before this runs, so no detectable leak
   * can hide behind it.
   */
  const KNOWN = new Set(["e", "pi", "sqrt", "abs", "log", "ln", "exp"]);
  for (const symbol of fragmentSymbols) {
    if (/^[0-9]+$/.test(symbol)) continue; // a stray constant proves nothing
    if (KNOWN.has(symbol)) continue;
    if (!answerSymbols.has(symbol)) return false;
  }

  for (const symbol of fragmentSymbols) {
    if (answerSymbols.has(symbol)) return true;
  }
  return false;
}

/**
 * Check a tutor reply against the answer it must not give.
 *
 * `suspect` is not a synonym for `leaked`: the caller retries on both, but
 * only `leaked` means we actually recognised the answer in the text.
 */
/**
 * Squash a string to its bare mathematical characters, for exact comparison.
 *
 * Whitespace, LaTeX delimiters and markup all go, so `x*e^x - e^x`,
 * `$x*e^x-e^x$` and `x * e^x  -  e^x` all reduce to the same thing.
 */
function squash(text: string): string {
  return text
    .toLowerCase()
    .replace(/\\left|\\right|\\cdot|\\times/g, "")
    .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\[a-z]+/g, "")
    .replace(/[\s${}\\]/g, "");
}

/**
 * Is the answer sitting in the reply verbatim?
 *
 * The fragment scanner tokenises on characters that cannot include spaces, so
 * a multi-term answer like `x*e^x - e^x` is only ever seen in pieces and never
 * compared as a whole — "so you get x*e^x - e^x" read as clean. Exact
 * containment is a blunt instrument and catches exactly that: it says nothing
 * about algebraically equivalent restatements, which is what the fragment path
 * and the equivalence checker are for.
 *
 * Skipped for very short answers, where a bare `2` or `e` would match half the
 * alphabet's worth of ordinary prose — those are distinctive enough as
 * standalone fragments, which the scanner does catch. Also skipped when the
 * answer is visible in the question itself, since restating the problem is not
 * a leak.
 */
function statedVerbatim(reply: string, question: Question): boolean {
  const answer = squash(question.canonicalAnswer);
  if (answer.length < 3) return false;
  if (squash(question.prompt).includes(answer)) return false;
  return squash(reply).includes(answer);
}

export function checkForLeak(reply: string, question: Question): LeakReport {
  const fragments = extractFragments(reply, question);

  if (statedVerbatim(reply, question)) {
    return { verdict: "leaked", offending: question.canonicalAnswer, fragments };
  }
  const opts = {
    answerType: question.answerType,
    variables: question.variables,
  } as const;

  let sawUndetermined: string | undefined;

  for (const fragment of fragments) {
    // A fragment that is just the tier number or a rung index is noise.
    if (/^[0-9]{1,2}$/.test(fragment) && fragment !== question.canonicalAnswer) {
      continue;
    }

    const agreement = compareAnswers(fragment, question.canonicalAnswer, opts);
    if (agreement === "agree") {
      return { verdict: "leaked", offending: fragment, fragments };
    }
    if (
      agreement === "undetermined" &&
      sawUndetermined === undefined &&
      couldBeTheAnswer(fragment, question)
    ) {
      sawUndetermined = fragment;
    }
  }

  if (sawUndetermined !== undefined) {
    return { verdict: "suspect", offending: sawUndetermined, fragments };
  }

  return { verdict: "clean", fragments };
}
