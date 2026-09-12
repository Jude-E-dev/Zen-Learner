import { describe, expect, it } from "vitest";
import { clockTone, targetCaption } from "./clock";
import { drillFor } from "@/lib/content/drills";
import { mentalTargets } from "@/lib/content/mental";

const mental = drillFor("mental-math");
const calculus = drillFor("calculus");

describe("clockTone", () => {
  it("calls the same elapsed time fast at tier 5 and slow at tier 1", () => {
    // The whole point of the band: seven seconds is a good tier-5 answer and a
    // laboured tier-1 one, and the flat 5s/12s thresholds called both "gold".
    expect(clockTone(7000, mental.targets(5))).toBe("text-jade");
    expect(clockTone(7000, mental.targets(1))).toBe("text-paper-dim");
  });

  it("treats the boundaries the way the band defines them", () => {
    const band = mentalTargets(3); // 5s target, 10s slow
    expect(clockTone(band.target, band)).toBe("text-jade");
    expect(clockTone(band.target + 1, band)).toBe("text-gold");
    expect(clockTone(band.slow, band)).toBe("text-gold");
    expect(clockTone(band.slow + 1, band)).toBe("text-paper-dim");
  });

  it("makes no claim when the drill has no band", () => {
    expect(calculus.targets(3)).toBeNull();
    expect(clockTone(60_000, calculus.targets(3))).toBe("text-paper");
  });
});

describe("targetCaption", () => {
  it("names the tier's target in whole seconds", () => {
    expect(targetCaption(mental.targets(1))).toBe("AIM 3S");
    expect(targetCaption(mental.targets(5))).toBe("AIM 10S");
  });

  it("has nothing to say without a band", () => {
    expect(targetCaption(calculus.targets(1))).toBeNull();
  });
});
