import { describe, expect, it } from "vitest";

import { DAILY_PAUSE_QUOTA } from "./config";
import {
  emptyQuota,
  hasQuota,
  localDay,
  normalizeQuota,
  quotaForToday,
  remainingPauses,
  spendPause,
} from "./quota";

/**
 * The quota's whole job is the day boundary, so that is where the tests are.
 * Local midnight on the device clock is the rule (design doc constraint #4),
 * which makes daylight saving and month ends the interesting cases rather
 * than the arithmetic of counting to five.
 */

const noon = (iso: string) => new Date(`${iso}T12:00:00`);

describe("the local day", () => {
  it("is the device's calendar date, zero-padded", () => {
    expect(localDay(new Date(2026, 8, 9, 14, 30))).toBe("2026-09-09");
    expect(localDay(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("changes at local midnight, not at UTC midnight", () => {
    // 23:59 and 00:01 local are different days whatever the offset is.
    const late = new Date(2026, 8, 9, 23, 59);
    const early = new Date(2026, 8, 10, 0, 1);
    expect(localDay(late)).toBe("2026-09-09");
    expect(localDay(early)).toBe("2026-09-10");
  });
});

describe("spending pauses", () => {
  it("starts the day with the full quota", () => {
    expect(remainingPauses(emptyQuota(noon("2026-09-09")), noon("2026-09-09"))).toBe(
      DAILY_PAUSE_QUOTA,
    );
  });

  it("runs out after exactly the quota", () => {
    const now = noon("2026-09-09");
    let quota = emptyQuota(now);
    for (let i = 0; i < DAILY_PAUSE_QUOTA; i++) {
      expect(hasQuota(quota, now)).toBe(true);
      quota = spendPause(quota, now);
    }
    expect(hasQuota(quota, now)).toBe(false);
    expect(remainingPauses(quota, now)).toBe(0);
  });

  it("never reports a negative remainder", () => {
    const now = noon("2026-09-09");
    const overspent = { day: localDay(now), used: DAILY_PAUSE_QUOTA + 3 };
    expect(remainingPauses(overspent, now)).toBe(0);
  });
});

describe("the day boundary", () => {
  it("gives an exhausted learner a fresh quota tomorrow", () => {
    const today = noon("2026-09-09");
    const tomorrow = noon("2026-09-10");
    const spent = { day: localDay(today), used: DAILY_PAUSE_QUOTA };

    expect(hasQuota(spent, today)).toBe(false);
    expect(hasQuota(spent, tomorrow)).toBe(true);
    expect(remainingPauses(spent, tomorrow)).toBe(DAILY_PAUSE_QUOTA);
  });

  it("rolls over rather than decaying — yesterday's count does not carry", () => {
    const yesterday = { day: "2026-09-08", used: 4 };
    expect(quotaForToday(yesterday, noon("2026-09-09"))).toEqual({
      day: "2026-09-09",
      used: 0,
    });
  });

  it("rolls over across a month end", () => {
    const spent = { day: "2026-09-30", used: DAILY_PAUSE_QUOTA };
    expect(hasQuota(spent, noon("2026-10-01"))).toBe(true);
  });

  /*
   * A clock moved backwards makes the stored day later than today's. That is
   * still "not today", so it resets — the generous reading. The quota bounds
   * ordinary spend; the spend cap bounds abuse.
   */
  it("resets rather than locking out when the device clock moves backwards", () => {
    const fromTheFuture = { day: "2027-01-01", used: DAILY_PAUSE_QUOTA };
    expect(hasQuota(fromTheFuture, noon("2026-09-09"))).toBe(true);
  });

  it("spending on a new day counts one, not one more than yesterday", () => {
    const yesterday = { day: "2026-09-08", used: 4 };
    expect(spendPause(yesterday, noon("2026-09-09"))).toEqual({
      day: "2026-09-09",
      used: 1,
    });
  });
});

describe("reading a stored quota", () => {
  /*
   * An absent or corrupt counter must read as "nothing spent". Treating it as
   * exhausted would switch the tutor off for every profile written before
   * version 3.
   */
  it("treats junk as a fresh day rather than an exhausted one", () => {
    for (const junk of [undefined, null, 42, "nope", {}, { day: "9/9/26", used: 1 }]) {
      expect(normalizeQuota(junk).used).toBe(0);
    }
  });

  it("keeps a well-formed counter", () => {
    expect(normalizeQuota({ day: "2026-09-09", used: 3 })).toEqual({
      day: "2026-09-09",
      used: 3,
    });
  });

  it("repairs a negative or fractional count without discarding the day", () => {
    expect(normalizeQuota({ day: "2026-09-09", used: -5 })).toEqual({
      day: "2026-09-09",
      used: 0,
    });
    expect(normalizeQuota({ day: "2026-09-09", used: 2.7 })).toEqual({
      day: "2026-09-09",
      used: 2,
    });
  });
});
