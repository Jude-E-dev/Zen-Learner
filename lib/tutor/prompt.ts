import type { Question } from "../content/schema";

/**
 * What the tutor is allowed to be.
 *
 * The constraint is the whole design (doc constraint #2): the tutor never
 * reasons about the problem. Everything it needs — the worked solution, the
 * hint ladder, the named misconception — is authored and handed to it, and its
 * only job is to say the next authored rung in a way that fits what this
 * learner just did. That is why a small model is the right one here: there is
 * nothing to work out, and a model that tries to work it out is a model that
 * eventually works it out *aloud*.
 *
 * Note what is NOT sent: the worked solution.
 *
 * An earlier version handed the model the whole solution at rung 3 and asked it
 * to walk the learner through it. That turn does not exist — `advanceHint` moves
 * past rung 3 into the `revealed` phase, which renders the authored worked
 * solution directly and never calls this. So the branch described a turn the app
 * never takes, and paid for it twice over: the 2026-09-09 eval produced two
 * outright answer leaks, both of them a rung-3 walkthrough narrating its way to
 * the final step. The answer key is still sent, because the model has to know
 * what not to say; the route to it is not.
 */

export const MAX_RUNG = 3;

export const SYSTEM_PROMPT = `You are a tutor in a calculus and mental-arithmetic practice hall. A learner is stuck on one question and has asked for help.

You will be given the question, its answer, its worked solution, a ladder of three authored hints, and — when we could identify it — the specific mistake the learner just made.

HOW YOU MUST REPLY

1. Never state the answer. Not as an expression, not as a number, not in words, not spelled out, not "it rhymes with", not as an equation the learner could solve in one step. The answer is in your context so you know what NOT to say.
2. Say at most two sentences. Exactly one of them is a question. End there.
3. Work from the authored hint for the current rung. Rephrase it to speak to the learner's actual mistake; do not invent a different hint and do not skip ahead to a later rung.
4. Never do the arithmetic or the differentiation for them, even partially. Do not show an intermediate result that leaves only one trivial step.
5. If the learner names the mistake themselves, confirm it in one sentence and ask what they will do about it.
6. No preamble, no praise, no "great question", no restating the problem back.

Rung ${MAX_RUNG} is the last hint, not a summary and not a solution. It is still one nudge in two sentences; the learner has somewhere to go after it.

TONE

Direct and quiet. The learner is mid-session and wants to get back to it. You are not a cheerleader.`;

export interface TutorRequest {
  question: Question;
  /** Which rung of the ladder we are on, 1-based. */
  rung: number;
  /** What the learner typed that was wrong. */
  wrongAnswer: string;
  /** The named misconception it matched, if any did. */
  misconceptionId?: string;
  /** What the learner said back, when this is not the first turn. */
  learnerReply?: string;
}

/**
 * The per-pause payload.
 *
 * Kept deliberately separate from the system prompt so the system prompt stays
 * byte-identical across pauses and can be cached — the payload is the only
 * part that varies, and prompt caching is a prefix match.
 */
export function buildUserMessage(req: TutorRequest): string {
  const { question, rung, wrongAnswer, misconceptionId, learnerReply } = req;

  const matched = question.misconceptions.find((m) => m.id === misconceptionId);
  const rungIndex = Math.min(Math.max(rung, 1), MAX_RUNG);

  const lines = [
    `QUESTION: ${question.prompt}`,
    `ANSWER (never reveal this): ${question.canonicalAnswer}`,
    "",
    `THE LEARNER ANSWERED: ${wrongAnswer}`,
  ];

  if (matched) {
    lines.push(
      `THIS MATCHES A KNOWN MISTAKE: ${matched.description}`,
      "Speak to this mistake specifically.",
    );
  } else {
    /*
     * An unmatched wrong answer is expected, not an error (design doc #2).
     * Saying so explicitly stops the model inventing a diagnosis to fill the
     * gap, which is the failure mode when a prompt leaves a slot empty.
     */
    lines.push(
      "WE COULD NOT IDENTIFY THE MISTAKE.",
      "Do not guess at what they did wrong. Give the hint for this rung plainly.",
    );
  }

  lines.push(
    "",
    `CURRENT RUNG: ${rungIndex} of ${MAX_RUNG}`,
    `THE AUTHORED HINT FOR THIS RUNG: ${question.hints[rungIndex - 1]}`,
  );

  if (learnerReply) {
    lines.push("", `THE LEARNER JUST SAID: ${learnerReply}`);
  }

  return lines.join("\n");
}
