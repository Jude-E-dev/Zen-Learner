import { describe, expect, it } from "vitest";
import {
  AVATAR_OPTIONS,
  AVATAR_SLOTS,
  BASE_PALETTE,
  defaultAvatar,
  findOption,
  isUnlocked,
  normalizeAvatar,
  resolvePalette,
} from "./avatar";
import { RANKS } from "./ranks";
import { RONIN_LOWER, RONIN_UPPER } from "@/components/Dojo";

/**
 * The load-bearing property here is that the sprite never renders with holes.
 * A pixel whose character has no colour is dropped by the renderer, so a
 * palette that is merely incomplete does not throw — it silently draws a ronin
 * with gaps in it. Every test below is ultimately guarding that.
 */

function charactersUsedBy(maps: string[][]): Set<string> {
  const used = new Set<string>();
  for (const map of maps) {
    for (const row of map) {
      for (const char of row) {
        if (char !== ".") used.add(char);
      }
    }
  }
  return used;
}

describe("avatar options", () => {
  it("every option unlocks at a rank that exists", () => {
    for (const slot of AVATAR_SLOTS) {
      for (const option of AVATAR_OPTIONS[slot]) {
        expect(
          RANKS.some((rank) => rank.id === option.unlockedBy),
          `${slot}/${option.id} unlocks at unknown rank "${option.unlockedBy}"`,
        ).toBe(true);
      }
    }
  });

  it("every slot has an option available at the starting rank", () => {
    const starting = RANKS[0].id;
    for (const slot of AVATAR_SLOTS) {
      const available = AVATAR_OPTIONS[slot].filter((o) => isUnlocked(o, starting));
      expect(available.length, `${slot} has nothing unlocked at ${starting}`).toBeGreaterThan(0);
    }
  });

  it("the default choice is unlocked at the starting rank", () => {
    const choice = defaultAvatar();
    for (const slot of AVATAR_SLOTS) {
      const option = findOption(slot, choice[slot]);
      expect(option, `default ${slot} "${choice[slot]}" does not exist`).toBeDefined();
      expect(isUnlocked(option!, RANKS[0].id)).toBe(true);
    }
  });

  it("option ids are unique within a slot", () => {
    for (const slot of AVATAR_SLOTS) {
      const ids = AVATAR_OPTIONS[slot].map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("isUnlocked", () => {
  it("unlocks everything at or below the held rank", () => {
    const kensei = RANKS[RANKS.length - 1].id;
    for (const slot of AVATAR_SLOTS) {
      for (const option of AVATAR_OPTIONS[slot]) {
        expect(isUnlocked(option, kensei)).toBe(true);
      }
    }
  });

  it("keeps higher ranks locked", () => {
    const gilt = findOption("hat", "gilt")!;
    expect(isUnlocked(gilt, "ashigaru")).toBe(false);
    expect(isUnlocked(gilt, "kensei")).toBe(true);
  });

  // A renamed rank must not throw the gate open for everyone.
  it("treats an unknown unlock rank as locked", () => {
    const bogus = { ...findOption("hat", "straw")!, unlockedBy: "shogun" };
    expect(isUnlocked(bogus, "kensei")).toBe(false);
  });
});

describe("resolvePalette", () => {
  it("colours every character the ronin sprite uses", () => {
    const used = charactersUsedBy([RONIN_UPPER, RONIN_LOWER]);
    const palette = resolvePalette(defaultAvatar(), "ashigaru");
    // The outline is the Dojo's, not the avatar's — it never recolours.
    for (const char of used) {
      if (char === "X") continue;
      expect(palette[char], `no colour for sprite character "${char}"`).toBeDefined();
    }
  });

  it("applies an unlocked choice", () => {
    const palette = resolvePalette(
      { hat: "gilt", robe: "moss", obi: "jade", hakama: "snow" },
      "kensei",
    );
    expect(palette.K).toBe(findOption("hat", "gilt")!.colors.K);
    expect(palette.H).toBe(findOption("robe", "moss")!.colors.H);
    expect(palette.O).toBe(findOption("obi", "jade")!.colors.O);
    expect(palette.P).toBe(findOption("hakama", "snow")!.colors.P);
  });

  it("falls back to the default when a slot is not unlocked yet", () => {
    const palette = resolvePalette(
      { hat: "gilt", robe: "indigo", obi: "blood", hakama: "olive" },
      "ashigaru",
    );
    expect(palette.K).toBe(findOption("hat", "straw")!.colors.K);
  });

  it("falls back to the default when a slot names an option that is gone", () => {
    const palette = resolvePalette(
      { hat: "sombrero", robe: "indigo", obi: "blood", hakama: "olive" },
      "kensei",
    );
    expect(palette.K).toBe(findOption("hat", "straw")!.colors.K);
  });

  it("never drops the fixed base colours", () => {
    const palette = resolvePalette({ hat: "x", robe: "y", obi: "z", hakama: "q" }, "ashigaru");
    for (const [char, colour] of Object.entries(BASE_PALETTE)) {
      expect(palette[char]).toBe(colour);
    }
  });
});

describe("normalizeAvatar", () => {
  it("keeps known ids", () => {
    expect(normalizeAvatar({ hat: "ash", robe: "moss", obi: "gold", hakama: "rust" })).toEqual({
      hat: "ash",
      robe: "moss",
      obi: "gold",
      hakama: "rust",
    });
  });

  it("replaces unknown ids with the default for that slot", () => {
    expect(normalizeAvatar({ hat: "ash", robe: "nonsense", obi: 7, hakama: "olive" })).toEqual({
      hat: "ash",
      robe: "indigo",
      obi: "blood",
      hakama: "olive",
    });
  });

  it.each([null, undefined, "straw", 42, []])(
    "falls back entirely on garbage input (%s)",
    (input) => {
      expect(normalizeAvatar(input)).toEqual(defaultAvatar());
    },
  );
});
