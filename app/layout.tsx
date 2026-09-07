import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zen Mode",
  description: "A practice hall for calculus. Grind questions, climb ranks, get unstuck.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-paper antialiased">{children}</body>
    </html>
  );
}
