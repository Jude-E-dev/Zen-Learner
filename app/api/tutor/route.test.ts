import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAll } from "@/lib/content/load";

/**
 * The provider client itself, mocked so `client.messages.create` is a plain
 * `vi.fn()` the tests can script. Everything else from the real module —
 * `Anthropic.APIError`, `Anthropic.APIConnectionTimeoutError` — is kept
 * genuine, because the route's `catch` block does `instanceof` checks against
 * those exact classes and a fake shape would not satisfy them.
 */
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    messages = { create: createMock };
    constructor(_opts?: unknown) {}
  }
  // Static error classes (`Anthropic.APIError`, `.APIConnectionTimeoutError`)
  // are inherited statics on the real class, not own properties — so they
  // have to be reached via the prototype chain rather than `Object.assign`,
  // which only copies own enumerable keys.
  Object.setPrototypeOf(MockAnthropic, actual.default);
  return { ...actual, default: MockAnthropic };
});

const Anthropic = (await import("@anthropic-ai/sdk")).default;
const { POST } = await import("./route");

/**
 * Only the paths that never reach the provider are exercised here — a bad
 * request, a blocked origin, and a build with no key. That is deliberate
 * rather than a limitation: those are exactly the paths that decide whether
 * we spend money, and the tutored path itself is covered by `pnpm eval:tutor`
 * against the real model.
 *
 * The contract worth protecting: every failure the learner can hit resolves
 * to the authored rung with a 200, because a fallback is a normal outcome the
 * pause renders and not an error the client has to catch.
 */

const question = loadAll().flatMap((f) => f.questions)[0];

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/tutor", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  createMock.mockReset();
});

/**
 * A question with an answer distinctive enough to state verbatim and be
 * unambiguously caught by `checkForLeak`'s exact-containment check, and short
 * enough that a "clean" reply reusing none of its characters is easy to write.
 */
const chainRuleQuestion = loadAll()
  .flatMap((f) => f.questions)
  .find((q) => q.id === "chain-rule-power")!;

function providerReply(text: string, tokens = 50) {
  return {
    content: [{ type: "text", text }],
    usage: {
      input_tokens: tokens,
      output_tokens: tokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

const CLEAN_REPLY = providerReply(
  "Focus on applying the rule carefully: differentiate the outer piece first, " +
    "then multiply by the derivative of what is inside it.",
);
const LEAKING_REPLY = providerReply(
  `So the derivative works out to ${chainRuleQuestion.canonicalAnswer}.`,
);

describe("POST /api/tutor — requests that must not reach the provider", () => {
  it("rejects a body that never parsed as JSON", async () => {
    const response = await post("{ not json");
    expect(response.status).toBe(400);
  });

  it("rejects a request the schema does not recognise", async () => {
    // A malformed question would otherwise reach the prompt builder and
    // produce a request we pay for and cannot use.
    const response = await post({ question, rung: 9, wrongAnswer: "42" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "request did not validate" });
  });

  it("turns away a caller without the shared secret", async () => {
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "let-me-in");
    // Keyless, so the allowed request below falls back instead of billing us.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post({ question, rung: 1, wrongAnswer: "42" })).status).toBe(403);
    const allowed = await post(
      { question, rung: 1, wrongAnswer: "42" },
      { "x-zen-tutor": "let-me-in" },
    );
    expect(allowed.status).not.toBe(403);
  });

  it("also accepts the secret under its client-side env var name", async () => {
    // The client can only ever read a NEXT_PUBLIC_-prefixed var (Next.js
    // inlines those at build time), so an operator who sets only that name
    // must not have every real request 403 against a server checking the
    // other name.
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_ZEN_TUTOR_SECRET", "let-me-in-too");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const allowed = await post(
      { question, rung: 1, wrongAnswer: "42" },
      { "x-zen-tutor": "let-me-in-too" },
    );
    expect(allowed.status).not.toBe(403);
  });

  it("rejects a request from a foreign origin", async () => {
    vi.stubEnv("ZEN_TUTOR_ORIGIN", "https://zen-learner.example");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const blocked = await post(
      { question, rung: 1, wrongAnswer: "42" },
      { origin: "https://evil.example" },
    );
    expect(blocked.status).toBe(403);

    const allowed = await post(
      { question, rung: 1, wrongAnswer: "42" },
      { origin: "https://zen-learner.example" },
    );
    expect(allowed.status).not.toBe(403);
  });
});

describe("POST /api/tutor — talking to the provider", () => {
  function postTutored() {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "");
    return post({ question: chainRuleQuestion, rung: 2, wrongAnswer: "42" });
  }

  it("returns the first reply as-is when it never leaks", async () => {
    createMock.mockResolvedValueOnce(CLEAN_REPLY);
    const response = await postTutored();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, retried: false });
    // Only one call to the model: no retry was needed.
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries at temperature 0 when the first reply leaks, and returns the clean retry", async () => {
    createMock.mockResolvedValueOnce(LEAKING_REPLY).mockResolvedValueOnce(CLEAN_REPLY);
    const response = await postTutored();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, retried: true });
    expect(createMock).toHaveBeenCalledTimes(2);
    // Design doc: the retry runs at temperature 0.
    expect(createMock.mock.calls[1][0]).toMatchObject({ temperature: 0 });
  });

  it("falls back to the authored hint when both attempts leak", async () => {
    createMock.mockResolvedValueOnce(LEAKING_REPLY).mockResolvedValueOnce(LEAKING_REPLY);
    const response = await postTutored();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "leak",
      hint: chainRuleQuestion.hints[1],
    });
  });

  it("falls back with reason \"timeout\" when the provider call times out", async () => {
    createMock.mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError());
    const response = await postTutored();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "timeout",
      hint: chainRuleQuestion.hints[1],
    });
  });

  it("falls back with reason \"provider-error\" on a provider-side API error", async () => {
    createMock.mockRejectedValueOnce(
      new Anthropic.APIError(500, { message: "internal error" }, "500 internal error", new Headers()),
    );
    const response = await postTutored();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "provider-error",
      hint: chainRuleQuestion.hints[1],
    });
  });
});

describe("POST /api/tutor — a build with no key is still a working pause", () => {
  it("answers with the authored rung rather than an error", async () => {
    // Pulling the key out entirely leaves the app fully playable (design doc,
    // definition of done). A 5xx here would read as an outage.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "");
    const response = await post({ question, rung: 2, wrongAnswer: "42" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "not-configured",
      hint: question.hints[1],
    });
  });
});

describe("POST /api/tutor — a deploy that forgot the guards says so", () => {
  /*
   * The guards fail open, which is correct for dev and dangerous on a public
   * deploy: an unset secret and an unset origin both let every caller through
   * without a word. These tests are about the word.
   */
  it("warns in production when both guards are unset", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_ZEN_TUTOR_SECRET", "");
    vi.stubEnv("ZEN_TUTOR_ORIGIN", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await post({ question, rung: 1, wrongAnswer: "42" });

    expect(warn).toHaveBeenCalledOnce();
    const line = warn.mock.calls[0][0] as string;
    expect(line).toContain("ZEN_TUTOR_SHARED_SECRET");
    expect(line).toContain("ZEN_TUTOR_ORIGIN");
    warn.mockRestore();
  });

  it("names only the guard that is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "let-me-in");
    vi.stubEnv("ZEN_TUTOR_ORIGIN", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await post({ question, rung: 1, wrongAnswer: "42" }, { "x-zen-tutor": "let-me-in" });

    const line = warn.mock.calls[0][0] as string;
    expect(line).toContain("ZEN_TUTOR_ORIGIN");
    expect(line).not.toContain("ZEN_TUTOR_SHARED_SECRET");
    warn.mockRestore();
  });

  it("stays quiet when both guards are set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "let-me-in");
    vi.stubEnv("ZEN_TUTOR_ORIGIN", "https://zen-learner.example");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await post(
      { question, rung: 1, wrongAnswer: "42" },
      { "x-zen-tutor": "let-me-in", origin: "https://zen-learner.example" },
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stays quiet in development, where nothing is set on purpose", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ZEN_TUTOR_SHARED_SECRET", "");
    vi.stubEnv("ZEN_TUTOR_ORIGIN", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await post({ question, rung: 1, wrongAnswer: "42" });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
