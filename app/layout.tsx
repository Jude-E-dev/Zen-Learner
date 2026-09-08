import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

/**
 * The display face.
 *
 * Until now the "16-bit" read was carried entirely by image-rendering:
 * pixelated, the SVG art and the offset box-shadows, while the type was a
 * plain system monospace stack — the one thing on the blacklist the design
 * review could not clear. Silkscreen is an actual bitmap face under the OFL,
 * self-hosted by next/font so it costs no runtime request and no third-party
 * origin.
 *
 * Display only. Body copy, the answer input and every piece of maths stay
 * monospace: Silkscreen has no lowercase depth to speak of at small sizes and
 * KaTeX needs metrics it does not have. A pixel font applied to a derivative
 * would be a costume, not a typeface.
 */
const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bitmap-face",
});

export const metadata: Metadata = {
  title: "Zen Mode",
  description: "A practice hall for calculus. Grind questions, climb ranks, get unstuck.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={silkscreen.variable}>
      <body className="min-h-dvh bg-ink text-paper antialiased">{children}</body>
    </html>
  );
}
