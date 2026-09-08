import { describe, expect, it } from "vitest";
import { decodeSummary, encodeSummary, summaryUrl } from "./permalink";
import { summaryFromSession, type Summary } from "./summary";
import { startSession, submitAnswer } from "../game/session";
import { loadAll } from "../content/load";
import { defaultAvatar } from "../game/avatar";

const pool = loadAll().flatMap((f) => f.questions);

/** What the app actually emits: base64url, unpadded. */
const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sample: Summary = {
  sessionNumber: 4,
  answered: 12,
  correct: 9,
  accuracy: 75,
  xp: 240,
  bestStreak: 6,
  tier: 3,
  rankId: "ronin",
  rankName: "Ronin",
  pauses: 2,
  unstuck: 2,
  avatar: { hat: "lacquer", robe: "moss", obi: "jade", hakama: "rust" },
  topic: "calculus",
  times: null,
};

describe("permalink round trip", () => {
  it("survives encode and decode intact", () => {
    expect(decodeSummary(encodeSummary(sample))).toEqual(sample);
  });

  it("stays short enough to paste into a chat", () => {
    // Long links get wrapped or truncated by clients, which is a broken share.
    expect(encodeSummary(sample).length).toBeLessThan(200);
  });

  it("produces a URL-safe blob with no characters needing escaping", () => {
    expect(encodeSummary(sample)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("builds a full URL without doubling the slash", () => {
    expect(summaryUrl(sample, "https://zen.example.com/")).toBe(
      `https://zen.example.com/summary?s=${encodeSummary(sample)}`,
    );
  });

  it("round-trips a timed drill, times and all", () => {
    const timed = {
      ...sample,
      topic: "mental-math" as const,
      times: { median: 4200, fastest: 1800 },
    };
    expect(decodeSummary(encodeSummary(timed))).toEqual(timed);
  });

  /*
   * Links written before mental math existed carry no drill and no times.
   * They were all calculus, and they have to keep opening.
   */
  it("still reads a link from before the drill field existed", () => {
    const legacy = b64url({
      v: 1, n: 3, a: 8, c: 6, x: 120, s: 4, t: 2, r: "bushi", p: 1, u: 1,
      av: ["straw", "indigo", "blood", "olive"],
    });
    const decoded = decodeSummary(legacy);
    expect(decoded).not.toBeNull();
    expect(decoded?.topic).toBe("calculus");
    expect(decoded?.times).toBeNull();
  });

  it("round-trips a real finished session", () => {
    let state = startSession(pool, 0);
    for (let i = 0; i < 4; i++) {
      state = submitAnswer(state, state.current!.canonicalAnswer, pool, i * 1000);
    }
    const summary = summaryFromSession(state, "bushi", 2, defaultAvatar());
    expect(decodeSummary(encodeSummary(summary))).toEqual(summary);
  });
});

/**
 * Every case below has to return null rather than throw. A shared link is
 * attacker-controlled input in the ordinary sense: anyone can edit the query
 * string, and the page must render a dead end instead of a stack trace.
 */
describe("permalink decode — hostile and broken input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["not base64", "!!!!"],
    ["base64 of nonsense", b64url("hello there")],
    ["base64 of a JSON array", b64url([1, 2, 3])],
    ["base64 of a bare number", b64url(42)],
    ["unterminated JSON", btoa('{"v":1,').replace(/=+$/, "")],
    ["standard base64 with + and /", "a+b/c"],
  ])("returns null for %s", (_label, input) => {
    expect(decodeSummary(input as string | null | undefined)).toBeNull();
  });

  it("returns null for a truncated blob", () => {
    const encoded = encodeSummary(sample);
    expect(decodeSummary(encoded.slice(0, encoded.length - 8))).toBeNull();
  });

  it("returns null for a blob from a future version", () => {
    expect(decodeSummary(b64url({ ...sample, v: 2 }))).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const good = { v: 1, n: 1, a: 1, c: 1, x: 1, s: 1, t: 1, r: "bushi", p: 0, u: 0, av: ["straw", "indigo", "blood", "olive"] };
    // Sanity: the untouched blob decodes, so the null below is the missing field.
    expect(decodeSummary(b64url(good))).not.toBeNull();
    const { x: _dropped, ...missing } = good;
    expect(decodeSummary(b64url(missing))).toBeNull();
  });

  it("returns null for an unknown rank id", () => {
    expect(
      decodeSummary(b64url({ v: 1, n: 1, a: 1, c: 1, x: 1, s: 1, t: 1, r: "shogun", p: 0, u: 0, av: ["straw", "indigo", "blood", "olive"] })),
    ).toBeNull();
  });

  it("returns null for an out-of-range tier", () => {
    expect(
      decodeSummary(b64url({ v: 1, n: 1, a: 1, c: 1, x: 1, s: 1, t: 9, r: "bushi", p: 0, u: 0, av: ["straw", "indigo", "blood", "olive"] })),
    ).toBeNull();
  });

  it("still decodes a link a client has re-padded with =", () => {
    const encoded = encodeSummary(sample);
    expect(decodeSummary(`${encoded}==`)).toEqual(sample);
  });

  it("rejects an absurdly long blob before trying to parse it", () => {
    expect(decodeSummary("A".repeat(5000))).toBeNull();
  });
});

describe("permalink decode — implausible but well-formed values", () => {
  const encode = (over: Record<string, unknown>) =>
    b64url({
      v: 1, n: 1, a: 10, c: 5, x: 100, s: 3, t: 2, r: "bushi", p: 0, u: 0,
      av: ["straw", "indigo", "blood", "olive"],
      ...over,
    });

  it("clamps correct answers to the number answered", () => {
    // A hand-edited link claiming 99/10 renders as 10/10, not as 990%.
    const summary = decodeSummary(encode({ a: 10, c: 99 }));
    expect(summary?.correct).toBe(10);
    expect(summary?.accuracy).toBe(100);
  });

  it("clamps unstuck answers to the number correct", () => {
    expect(decodeSummary(encode({ c: 5, u: 50 }))?.unstuck).toBe(5);
  });

  it("reports zero accuracy rather than dividing by zero", () => {
    expect(decodeSummary(encode({ a: 0, c: 0 }))?.accuracy).toBe(0);
  });

  it("falls back to the default kit for avatar ids it does not know", () => {
    const summary = decodeSummary(encode({ av: ["sombrero", "indigo", "blood", "olive"] }));
    expect(summary?.avatar).toEqual({ hat: "straw", robe: "indigo", obi: "blood", hakama: "olive" });
  });

  it("resolves the rank name from the id rather than trusting the link", () => {
    expect(decodeSummary(encode({ r: "kensei" }))?.rankName).toBe("Kensei");
  });
});
