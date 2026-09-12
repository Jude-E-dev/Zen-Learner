import type { TimeTargets } from "@/lib/content/mental";

/**
 * How the clock on a timed question reads itself.
 *
 * The colours used to be hardcoded at 5s and 12s for every tier, which made
 * "fast" mean the same thing for `7 + 8` as for `49 × 29`. The band now comes
 * from the drill (`Drill.targets`), so this file only decides what a band
 * *looks* like and never which numbers it holds — retuning the bands is still
 * a one-line edit in mental.ts.
 *
 * Kept out of page.tsx because it is the only part of the clock that is worth
 * testing: the boundaries are exactly where an off-by-one would be invisible
 * on screen and wrong in every session.
 */

/**
 * Text colour for an elapsed time against the tier's band, following the band's
 * own definition: at or under `target` is fast, past `slow` reads as slow.
 *
 * A null band means the drill is not about speed and the clock should not be
 * rendered at all — but if it is, it makes no claim rather than calling a
 * time slow against thresholds that do not exist.
 */
export function clockTone(elapsed: number, targets: TimeTargets | null): string {
  if (!targets) return "text-paper";
  if (elapsed <= targets.target) return "text-jade";
  if (elapsed <= targets.slow) return "text-gold";
  return "text-paper-dim";
}

/**
 * The caption under the clock, or null when there is no band to name.
 *
 * A colour alone only means something to a learner who has worked out what the
 * colours are, which is the same problem the flat band had: the clock became
 * useful after a personal baseline existed rather than on question one. Saying
 * the number out loud is what makes the first question legible.
 *
 * Whole seconds because every band is one (3/4/5/7/10) and a caption is not
 * the place to imply precision the table does not have.
 */
export function targetCaption(targets: TimeTargets | null): string | null {
  if (!targets) return null;
  return `AIM ${Math.round(targets.target / 1000)}S`;
}
