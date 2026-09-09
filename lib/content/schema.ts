import { z } from "zod";

/**
 * The question bank is the product (design doc constraint #1).
 *
 * Every field here is authored by a human and validated at build time. Nothing
 * in this schema is ever generated at runtime. `pnpm validate:content` fails the
 * build on any violation, including semantic ones the type system can't see
 * (an answer key that disagrees with its own worked solution, a "wrong answer"
 * distractor that is actually correct).
 */

export const ANSWER_TYPES = ["expression", "antiderivative", "number"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

/**
 * The drills. Calculus is the authored bank this schema was written for;
 * mental-math is generated at runtime (lib/content/mental.ts) and validated by
 * property tests rather than by `pnpm validate:content`, which only ever sees
 * files on disk.
 */
export const TOPICS = ["calculus", "mental-math"] as const;
export type Topic = (typeof TOPICS)[number];

/**
 * One step of the authored worked solution. `result` is the state of the
 * problem after this step; the LAST step's result must be equivalent to
 * canonicalAnswer, which is what the validator checks.
 */
export const WorkedStepSchema = z.object({
  step: z.string().min(1, "worked solution step needs prose"),
  result: z.string().min(1).optional(),
});

/**
 * A named misconception and the wrong answer it produces. This is what lets the
 * tutor say something specific about *this* mistake without reasoning about the
 * problem itself (constraint #2).
 */
export const MisconceptionSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, "misconception id must be kebab-case"),
  description: z
    .string()
    .min(10, "describe the misconception well enough to write a hint against it"),
  wrongAnswer: z.string().min(1),
});

export const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "question id must be kebab-case"),
  topic: z.enum(TOPICS),
  subtopic: z.string().min(1),
  /** Difficulty tier 1-5. The selector promotes/demotes within this range. */
  tier: z.number().int().min(1).max(5),
  /** LaTeX-capable prompt shown to the learner. */
  prompt: z.string().min(1),
  answerType: z.enum(ANSWER_TYPES),
  /**
   * Free variables the answer may contain. Sampling generates a value per
   * variable, so implicit-differentiation answers like -x/y work.
   */
  variables: z.array(z.string().min(1)).default(["x"]),
  canonicalAnswer: z.string().min(1),
  /**
   * Escape hatch only. The checker compares by numeric behavior, so this is for
   * answers that aren't numerically evaluable (e.g. "dne"). Every entry is
   * validated as genuinely equivalent to canonicalAnswer where it can be.
   */
  acceptedForms: z.array(z.string().min(1)).default([]),
  /**
   * Does the learner have to *do* the arithmetic?
   *
   * The checker grades by behaviour, which is exactly right for calculus —
   * `3/3` is a perfectly good way to say `1` and nobody should have to
   * simplify to be marked correct. It is exactly wrong for a mental maths
   * drill: `31*20` behaves identically to `620`, so typing the question back
   * scored as a correct answer and the drill graded itself. Setting this
   * demands an evaluated number and nudges anything else instead of scoring
   * it, which is the honest verdict — restating the question is not a wrong
   * answer, it is not an answer.
   */
  requireEvaluated: z.boolean().default(false),
  workedSolution: z
    .array(WorkedStepSchema)
    .min(2, "a worked solution needs at least two steps to be worth showing"),
  /** Exactly three rungs, per the pause protocol in constraint #2. */
  hints: z
    .array(z.string().min(1))
    .length(3, "hint ladder must have exactly 3 rungs"),
  misconceptions: z.array(MisconceptionSchema).min(2).max(4),
});

export type Question = z.infer<typeof QuestionSchema>;
export type Misconception = z.infer<typeof MisconceptionSchema>;
export type WorkedStep = z.infer<typeof WorkedStepSchema>;

/**
 * What may appear in `content/`. Authored files are calculus only — a
 * generated topic has no business being committed as YAML, and this is what
 * stops one drifting in.
 */
export const QuestionFileSchema = z.object({
  questions: z
    .array(QuestionSchema.extend({ topic: z.literal("calculus") }))
    .min(1),
});
