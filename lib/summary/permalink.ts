import {
  blobFromSummary,
  summaryFromBlob,
  summarySchema,
  type Summary,
} from "./summary";

/**
 * The summary, as a URL.
 *
 * There is no server-side store, so the card has to travel inside the link
 * itself. Short keys and a positional avatar tuple keep it near 120 characters
 * — long enough to be honest, short enough that a chat client will not wrap or
 * truncate it.
 *
 * Decode never throws and never trusts. Anything malformed, truncated,
 * hand-edited or from a future version comes back as null and the page renders
 * a friendly dead end (design doc, eng review issue 6) rather than crashing on
 * a shape it cannot read. Nothing decoded is written to the profile: a link is
 * something to look at, not a way to award yourself a rank.
 */

export const SUMMARY_PARAM = "s";

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string | null {
  // Reject anything outside the alphabet before handing it to atob, which
  // throws on some inputs and silently tolerates others depending on the
  // engine. Trailing "=" is allowed through: encodeSummary never emits it, but
  // clients that re-encode a link often add it back and it changes nothing.
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(input)) return null;

  const stripped = input.replace(/=+$/, "");
  const padded = stripped
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(stripped.length + ((4 - (stripped.length % 4)) % 4), "=");

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeSummary(summary: Summary): string {
  return toBase64Url(JSON.stringify(blobFromSummary(summary)));
}

/** Returns null for anything that is not a summary this build can read. */
export function decodeSummary(encoded: string | null | undefined): Summary | null {
  if (!encoded) return null;
  // A pasted link can arrive with the query string still attached.
  const cleaned = encoded.trim();
  if (cleaned.length === 0 || cleaned.length > 2000) return null;

  const json = fromBase64Url(cleaned);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const result = summarySchema.safeParse(parsed);
  if (!result.success) return null;

  return summaryFromBlob(result.data);
}

/** The full shareable URL for a finished session. */
export function summaryUrl(summary: Summary, origin: string): string {
  return `${origin.replace(/\/$/, "")}/summary?${SUMMARY_PARAM}=${encodeSummary(summary)}`;
}
