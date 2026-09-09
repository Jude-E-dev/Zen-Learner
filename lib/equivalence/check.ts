import { derivative, parse, type EvalFunction, type MathNode } from "mathjs";
import type { Question } from "../content/schema";
import { normalize, normalizedEqual } from "./normalize";

/**
 * Answer checking by behavior, not by spelling.
 *
 * Two expressions are the same answer if they *do* the same thing, so we
 * evaluate both at many points rather than trying to prove their text matches.
 * That is what lets `2sin(x)cos(x)` and `sin(2x)` both count as correct without
 * anyone enumerating them by hand.
 *
 * Three things make this non-trivial, and all three are load-bearing:
 *
 *   1. Antiderivatives differ by a constant. F(x)+C1 and F(x)+C2 are both
 *      correct and never agree pointwise, so for `antiderivative` questions we
 *      differentiate both before comparing (falling back to comparing
 *      F(b)-F(a), where the constant also cancels).
 *   2. Sample points land in undefined regions. log, sqrt and tan have domain
 *      holes; a point where either side is undefined tells us nothing, so it is
 *      discarded and we sample elsewhere.
 *   3. Running out of usable points means "I can't tell", never "you're wrong".
 *      A false "incorrect" on a correct answer is the single most
 *      trust-destroying thing this app can do, so uncertainty always resolves
 *      to `unreadable`.
 *
 *                 input
 *                   |
 *        [ requireEvaluated? ]------ unevaluated -------> unreadable(+nudge)
 *                   |
 *          [ normalize + fast path ]---- exact match ----> correct
 *                   |
 *          [ string misconception ]----- match --------> incorrect(+id)
 *                   |
 *              [ parse ]------------- fail ------------> unreadable
 *                   |
 *      answerType ? antiderivative -> d/dx both, then sample
 *                 ? number         -> evaluate both, compare
 *                 ? expression     -> sample both
 *                   |
 *        agree -> correct | disagree -> incorrect(+id?) | undetermined -> unreadable
 */

export type Verdict = "correct" | "incorrect" | "unreadable";

export interface CheckResult {
  verdict: Verdict;
  /** Set when an incorrect answer matched an authored misconception distractor. */
  misconceptionId?: string;
  /**
   * Set when the submission was the sum rather than its value, on a question
   * that asks for the value. The UI says something different here: "I couldn't
   * read that" is a lie when the input parsed perfectly.
   */
  needsEvaluation?: boolean;
  /** Human-readable rationale, surfaced in dev and in the event log. */
  reason: string;
}

type Agreement = "agree" | "disagree" | "undetermined";

/**
 * Deterministic sample points, not random ones. Reproducible failures matter
 * more here than statistical purity: a flaky checker that marks an answer wrong
 * one run in fifty is worse than no checker. All are positive so log and sqrt
 * stay defined, and none are near multiples of pi/2 where tan blows up.
 */
const SAMPLE_BASE = [
  0.4132, 1.2749, 2.3891, 0.7321, 1.9187, 3.1041, 0.2537, 2.8613,
  1.5519, 0.9043, 2.1277, 1.1301, 0.6199, 2.6421, 1.7753, 0.3391,
  1.4127, 2.2569, 0.8807, 1.6433,
];

const MIN_AGREEMENTS = 5;
const ABS_TOL = 1e-9;
const REL_TOL = 1e-7;
/** Beyond this magnitude, floating point noise swamps the comparison. */
const MAX_MAGNITUDE = 1e12;

function sampleFor(variables: string[], index: number): Record<string, number> {
  const scope: Record<string, number> = {};
  variables.forEach((name, k) => {
    const base = SAMPLE_BASE[(index + k * 7) % SAMPLE_BASE.length];
    // Offset per variable so we never sample the x === y diagonal, which would
    // make answers like -x/y and -1 look identical.
    scope[name] = base + k * 0.137;
  });
  return scope;
}

function tryParse(source: string): MathNode | null {
  try {
    return parse(normalize(source));
  } catch {
    return null;
  }
}

function tryCompile(node: MathNode): EvalFunction | null {
  try {
    return node.compile();
  } catch {
    return null;
  }
}

/** Evaluate to a usable real number, or null if the point tells us nothing. */
function evalAt(
  code: EvalFunction,
  scope: Record<string, number>,
): number | null {
  let value: unknown;
  try {
    value = code.evaluate({ ...scope });
  } catch {
    return null;
  }
  if (typeof value !== "number") return null; // Complex, Unit, Matrix, undefined
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > MAX_MAGNITUDE) return null;
  return value;
}

function closeEnough(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= ABS_TOL + REL_TOL * scale;
}

/** Sample both expressions across the domain and see whether they behave alike. */
function sampleCompare(a: MathNode, b: MathNode, variables: string[]): Agreement {
  const codeA = tryCompile(a);
  const codeB = tryCompile(b);
  if (!codeA || !codeB) return "undetermined";

  let agreements = 0;

  for (let i = 0; i < SAMPLE_BASE.length; i++) {
    const scope = sampleFor(variables, i);
    const va = evalAt(codeA, scope);
    const vb = evalAt(codeB, scope);
    // Either side undefined here: the point is uninformative, not evidence.
    if (va === null || vb === null) continue;

    if (!closeEnough(va, vb)) return "disagree";
    agreements++;
  }

  return agreements >= MIN_AGREEMENTS ? "agree" : "undetermined";
}

/**
 * Compare antiderivatives, where a difference of a constant is not a difference
 * of answers. Differentiating is the clean way; if mathjs can't differentiate
 * the expression symbolically we compare F(b) - F(a) instead, where the
 * constant cancels just as well.
 */
function antiderivativeCompare(
  a: MathNode,
  b: MathNode,
  variables: string[],
): Agreement {
  const v = variables[0] ?? "x";

  try {
    return sampleCompare(derivative(a, v), derivative(b, v), variables);
  } catch {
    // Fall through to the difference method.
  }

  const codeA = tryCompile(a);
  const codeB = tryCompile(b);
  if (!codeA || !codeB) return "undetermined";

  let agreements = 0;

  for (let i = 0; i + 1 < SAMPLE_BASE.length; i += 2) {
    const lo = sampleFor(variables, i);
    const hi = sampleFor(variables, i + 1);

    const a1 = evalAt(codeA, lo);
    const a2 = evalAt(codeA, hi);
    const b1 = evalAt(codeB, lo);
    const b2 = evalAt(codeB, hi);
    if (a1 === null || a2 === null || b1 === null || b2 === null) continue;

    if (!closeEnough(a2 - a1, b2 - b1)) return "disagree";
    agreements++;
  }

  return agreements >= Math.ceil(MIN_AGREEMENTS / 2) ? "agree" : "undetermined";
}

function numberCompare(a: MathNode, b: MathNode): Agreement {
  const codeA = tryCompile(a);
  const codeB = tryCompile(b);
  if (!codeA || !codeB) return "undetermined";

  const va = evalAt(codeA, {});
  const vb = evalAt(codeB, {});
  if (va === null || vb === null) return "undetermined";

  return closeEnough(va, vb) ? "agree" : "disagree";
}

/**
 * Has this input been worked out, or is it still a sum?
 *
 * A plain number, optionally signed and optionally parenthesised — `620`,
 * `-3`, `(41)`. Anything with an operator, a function or a symbol left in it
 * is a calculation the learner has handed back rather than performed.
 *
 * Deliberately structural rather than a regex over the raw text: mathjs has
 * already decided what the input *is*, and re-deciding it with a pattern is
 * how the two answers drift apart.
 */
function isEvaluatedNumber(node: MathNode): boolean {
  if (node.type === "ConstantNode") {
    return typeof (node as unknown as { value: unknown }).value === "number";
  }
  if (node.type === "ParenthesisNode") {
    return isEvaluatedNumber(
      (node as unknown as { content: MathNode }).content,
    );
  }
  if (node.type === "OperatorNode") {
    const op = node as unknown as { fn: string; args: MathNode[] };
    return (
      (op.fn === "unaryMinus" || op.fn === "unaryPlus") &&
      op.args.length === 1 &&
      isEvaluatedNumber(op.args[0])
    );
  }
  return false;
}

export interface CompareOptions {
  answerType: Question["answerType"];
  variables: string[];
}

/**
 * Are these two answers the same answer? Exported because three separate
 * consumers need exactly this question answered: grading a learner's input,
 * matching misconception distractors, and checking whether the tutor just
 * leaked the answer.
 */
export function compareAnswers(
  a: string,
  b: string,
  opts: CompareOptions,
): Agreement {
  if (normalizedEqual(a, b)) return "agree";

  const nodeA = tryParse(a);
  const nodeB = tryParse(b);
  if (!nodeA || !nodeB) return "undetermined";

  switch (opts.answerType) {
    case "number":
      return numberCompare(nodeA, nodeB);
    case "antiderivative":
      return antiderivativeCompare(nodeA, nodeB, opts.variables);
    case "expression":
      return sampleCompare(nodeA, nodeB, opts.variables);
  }
}

function findMisconception(
  input: string,
  question: Question,
  numeric: boolean,
): string | undefined {
  const opts: CompareOptions = {
    answerType: question.answerType,
    variables: question.variables,
  };

  for (const m of question.misconceptions) {
    if (normalizedEqual(input, m.wrongAnswer)) return m.id;
    if (numeric && compareAnswers(input, m.wrongAnswer, opts) === "agree") {
      return m.id;
    }
  }
  return undefined;
}

/**
 * Grade one submitted answer.
 *
 * Note the asymmetry: we need many agreeing sample points to call something
 * correct, but a single clear disagreement is enough to call it incorrect. Two
 * functions that differ anywhere are different functions.
 */
export function checkAnswer(input: string, question: Question): CheckResult {
  if (input.trim() === "") {
    return { verdict: "unreadable", reason: "empty submission" };
  }

  const opts: CompareOptions = {
    answerType: question.answerType,
    variables: question.variables,
  };

  /*
   * Before anything is compared: on a drill that asks for the value, the sum
   * itself is not an answer. This runs first because every path below would
   * otherwise reward it — `31*20` agrees with `620` numerically, and a
   * restated sum that lands on a distractor would be scored as that
   * misconception, which it is not.
   *
   * Unparseable input falls through to the ordinary unreadable path; there is
   * nothing useful to say about notation from here.
   */
  if (question.requireEvaluated) {
    const node = tryParse(input);
    if (node && !isEvaluatedNumber(node)) {
      return {
        verdict: "unreadable",
        needsEvaluation: true,
        reason: "restates the question instead of evaluating it",
      };
    }
  }

  // Fast path: textually identical to the answer key or an accepted form.
  if (normalizedEqual(input, question.canonicalAnswer)) {
    return { verdict: "correct", reason: "matches canonical answer" };
  }
  for (const form of question.acceptedForms) {
    if (normalizedEqual(input, form)) {
      return { verdict: "correct", reason: "matches an accepted form" };
    }
  }

  // String-level misconception match runs before parsing so non-numeric
  // distractors like "dne" are still recognised as the specific mistake they are.
  const textual = findMisconception(input, question, false);
  if (textual) {
    return {
      verdict: "incorrect",
      misconceptionId: textual,
      reason: `matches misconception ${textual}`,
    };
  }

  if (!tryParse(input)) {
    return { verdict: "unreadable", reason: "could not parse submission" };
  }
  if (!tryParse(question.canonicalAnswer)) {
    // A content bug, not a learner mistake. validate:content catches these
    // before they ship; never blame the learner for one.
    return { verdict: "unreadable", reason: "answer key failed to parse" };
  }

  const agreement = compareAnswers(input, question.canonicalAnswer, opts);

  if (agreement === "agree") {
    return { verdict: "correct", reason: "behaves identically to the answer key" };
  }
  if (agreement === "undetermined") {
    return {
      verdict: "unreadable",
      reason: "not enough usable sample points to decide",
    };
  }

  const numeric = findMisconception(input, question, true);
  return {
    verdict: "incorrect",
    misconceptionId: numeric,
    reason: numeric
      ? `matches misconception ${numeric}`
      : "differs from the answer key",
  };
}
