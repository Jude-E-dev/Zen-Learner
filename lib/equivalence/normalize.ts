/**
 * Turn human-typed maths into something mathjs can parse.
 *
 * Learners type a mix of plain ASCII (`2x*cos(x^2)`) and LaTeX pasted or
 * half-remembered from a textbook (`2x\cdot\cos(x^{2})`). Both must reach the
 * parser as the same thing. This is the fast path and the pre-parse step for
 * the behavioral checker in ./check.ts — it is NOT the equivalence test itself.
 *
 * Convention: `ln` and `log` both mean natural log, matching mathjs's `log()`
 * and standard calculus usage. `log10` stays explicit.
 */

/** Extract `{...}` starting at `open`, honoring nesting. Returns null if unbalanced. */
function readBraceGroup(
  src: string,
  open: number,
): { body: string; end: number } | null {
  if (src[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return { body: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/**
 * Rewrite `\frac{a}{b}` to `((a)/(b))` and `\sqrt{a}` to `sqrt(a)`, innermost
 * first. Regex can't do this correctly once the arguments nest, and calculus
 * answers nest constantly.
 */
function expandBraceCommands(input: string): string {
  let src = input;

  for (let guard = 0; guard < 100; guard++) {
    const fracAt = src.search(/\\(?:d|t)?frac\s*\{/);
    const sqrtAt = src.search(/\\sqrt\s*\{/);
    if (fracAt === -1 && sqrtAt === -1) break;

    // Rewrite whichever appears first so nesting resolves predictably.
    const useFrac = fracAt !== -1 && (sqrtAt === -1 || fracAt < sqrtAt);
    const at = useFrac ? fracAt : sqrtAt;
    const firstBrace = src.indexOf("{", at);
    const first = readBraceGroup(src, firstBrace);
    if (!first) break;

    if (useFrac) {
      const second = readBraceGroup(src, first.end);
      if (!second) break;
      src =
        src.slice(0, at) +
        `((${first.body})/(${second.body}))` +
        src.slice(second.end);
    } else {
      src = src.slice(0, at) + `sqrt(${first.body})` + src.slice(first.end);
    }
  }

  return src;
}

/** Rewrite `^{...}` and `_{...}` into parenthesized / dropped forms. */
function expandScripts(input: string): string {
  let src = input;

  for (let guard = 0; guard < 100; guard++) {
    const at = src.search(/[\^_]\s*\{/);
    if (at === -1) break;
    const brace = src.indexOf("{", at);
    const group = readBraceGroup(src, brace);
    if (!group) break;
    const replacement = src[at] === "^" ? `^(${group.body})` : "";
    src = src.slice(0, at) + replacement + src.slice(group.end);
  }

  return src;
}

const FUNCTION_WORDS = [
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
  "sin", "cos", "tan", "sec", "csc", "cot", "exp", "log", "ln",
];

export function normalize(raw: string): string {
  let s = raw.trim();

  // Strip maths-mode delimiters.
  s = s.replace(/\\[()[\]]/g, " ").replace(/\$\$?/g, " ");

  // \left( \right] etc. are pure presentation.
  s = s.replace(/\\left\s*/g, "").replace(/\\right\s*/g, "");

  s = expandBraceCommands(s);
  s = expandScripts(s);

  // Operators and constants.
  s = s
    .replace(/\\cdot|\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi\b/g, "pi")
    .replace(/\\infty/g, "Infinity")
    .replace(/\\,|\\;|\\!|\\quad|\\qquad/g, " ");

  // Function names: drop the backslash so \sin -> sin.
  for (const fn of FUNCTION_WORDS) {
    s = s.replace(new RegExp(`\\\\${fn}\\b`, "g"), fn);
  }

  // Any remaining LaTeX control sequence is noise we can't interpret; dropping
  // the backslash gives the parser its best shot at the identifier underneath.
  s = s.replace(/\\/g, "");

  // `ln` is mathjs's `log` (natural). Do this after backslash stripping so both
  // `\ln` and a bare `ln` are covered.
  s = s.replace(/\bln\s*\(/g, "log(");
  s = s.replace(/\bln\b/g, "log");

  // Unicode a learner may paste from a textbook or macOS keyboard.
  s = s
    .replace(/[−–—]/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/∞/g, "Infinity")
    .replace(/√/g, "sqrt");

  // Braces that survived are grouping, not LaTeX arguments.
  s = s.replace(/[{}]/g, "");

  s = s.replace(/\s+/g, " ").trim().toLowerCase();

  // "+ C" is decoration on an antiderivative; the checker cancels the constant
  // by differentiating, but normalizing it away makes the string fast path hit
  // far more often.
  s = s.replace(/\s*\+\s*c\b\s*$/, "");

  return s;
}

/** Cheap pre-parse equality: same normalized text. */
export function normalizedEqual(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
