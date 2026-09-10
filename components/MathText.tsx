"use client";

import katex from "katex";
import { useMemo } from "react";

/**
 * Render authored prose containing inline `$...$` maths.
 *
 * Question prompts, hints and worked solutions are authored as plain text with
 * LaTeX islands. Splitting on `$` keeps the content files readable for whoever
 * is writing questions, which matters more here than markup purity: the bank is
 * the product, so authoring has to stay pleasant.
 */
export function MathText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const segments = useMemo(() => splitMath(text), [text]);

  return (
    <span className={className}>
      {segments.map((segment, i) =>
        segment.math ? (
          <span
            key={i}
            // Authored content and the tutor's live model reply both render
            // through here, so renderMath() pins `trust: false` explicitly
            // rather than relying on KaTeX's default — that's what keeps
            // \href/\includegraphics-style injection out of model text.
            dangerouslySetInnerHTML={{ __html: renderMath(segment.value) }}
          />
        ) : (
          <span key={i}>{segment.value}</span>
        ),
      )}
    </span>
  );
}

interface Segment {
  math: boolean;
  value: string;
}

function splitMath(text: string): Segment[] {
  const out: Segment[] = [];
  let rest = text;

  while (rest.length > 0) {
    const open = rest.indexOf("$");
    if (open === -1) {
      out.push({ math: false, value: rest });
      break;
    }
    if (open > 0) out.push({ math: false, value: rest.slice(0, open) });

    const close = rest.indexOf("$", open + 1);
    if (close === -1) {
      // Unbalanced delimiter in authored content: show it literally rather than
      // swallowing the rest of the sentence.
      out.push({ math: false, value: rest.slice(open) });
      break;
    }
    out.push({ math: true, value: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }

  return out;
}

function renderMath(tex: string): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: false,
      trust: false,
    });
  } catch {
    return tex;
  }
}
