import { RANKS } from "./ranks";

/**
 * The ronin you customise.
 *
 * The sprite in Dojo.tsx was always drawn from a character grid plus a
 * character-to-colour map, which is the right shape for this — but the map was
 * a module constant the art resolved against directly, so the figure was
 * single-skin. This file owns the parts that vary; the grid stays where it is.
 *
 * Options unlock by rank rather than by currency. The coin economy that was
 * meant to gate this does not exist yet, and inventing a placeholder wallet
 * would mean a shop with imaginary money in it. Ranks are already earned, and
 * already mean something: the reward for holding tier 3 is that you get to
 * look like someone who holds tier 3.
 */

/** The slots a learner can change. Everything else about the sprite is fixed. */
export type AvatarSlot = "hat" | "robe" | "obi" | "hakama";

export interface AvatarOption {
  id: string;
  name: string;
  /** The rank that unlocks this option, by id. */
  unlockedBy: string;
  /** The colour shown in the picker. */
  swatch: string;
  /** Palette entries this option supplies, keyed by sprite character. */
  colors: Record<string, string>;
}

/**
 * Sprite colours that never change: the face is lit so it reads as a face at
 * this scale, and the post is scenery rather than kit.
 */
export const BASE_PALETTE: Record<string, string> = {
  f: "#d9a882", // skin, lit
  e: "#9c6f52", // skin, shadowed under the brim
  S: "#8a5a3a", // scabbard and belt leather
  s: "#52341f", // leather, shaded
  w: "#b8563f", // the wraps binding the shins
};

export const AVATAR_OPTIONS: Record<AvatarSlot, AvatarOption[]> = {
  hat: [
    {
      id: "straw",
      name: "Straw",
      unlockedBy: "ashigaru",
      swatch: "#e8d39a",
      colors: { K: "#e8d39a", k: "#c2a768", j: "#8a7442" },
    },
    {
      id: "ash",
      name: "Ash",
      unlockedBy: "bushi",
      swatch: "#c9ccd1",
      colors: { K: "#c9ccd1", k: "#9aa0a8", j: "#6b7079" },
    },
    {
      id: "lacquer",
      name: "Lacquer",
      unlockedBy: "ronin",
      swatch: "#4a4f5e",
      colors: { K: "#4a4f5e", k: "#333743", j: "#1f2230" },
    },
    {
      id: "crimson",
      name: "Crimson",
      unlockedBy: "samurai",
      swatch: "#c25055",
      colors: { K: "#c25055", k: "#94383d", j: "#5f2327" },
    },
    {
      id: "gilt",
      name: "Gilt",
      unlockedBy: "kensei",
      swatch: "#f0c65c",
      colors: { K: "#f0c65c", k: "#c09a3c", j: "#836726" },
    },
  ],
  robe: [
    {
      id: "indigo",
      name: "Indigo",
      unlockedBy: "ashigaru",
      swatch: "#4a5c74",
      colors: { H: "#4a5c74", h: "#34435a", g: "#222c40" },
    },
    {
      id: "slate",
      name: "Slate",
      unlockedBy: "bushi",
      swatch: "#5c6470",
      colors: { H: "#5c6470", h: "#434a56", g: "#2c313b" },
    },
    {
      id: "moss",
      name: "Moss",
      unlockedBy: "ronin",
      swatch: "#4f6b52",
      colors: { H: "#4f6b52", h: "#39503c", g: "#243626" },
    },
    {
      id: "plum",
      name: "Plum",
      unlockedBy: "samurai",
      swatch: "#63496b",
      colors: { H: "#63496b", h: "#493352", g: "#2e1f36" },
    },
    {
      id: "bone",
      name: "Bone",
      unlockedBy: "kensei",
      swatch: "#a89e8a",
      colors: { H: "#a89e8a", h: "#807766", g: "#554e42" },
    },
  ],
  obi: [
    {
      id: "blood",
      name: "Blood",
      unlockedBy: "ashigaru",
      swatch: "#a04a34",
      colors: { O: "#a04a34", o: "#6b2f22" },
    },
    {
      id: "gold",
      name: "Gold",
      unlockedBy: "bushi",
      swatch: "#d09a3c",
      colors: { O: "#d09a3c", o: "#8a6222" },
    },
    {
      id: "jade",
      name: "Jade",
      unlockedBy: "ronin",
      swatch: "#3f8f5c",
      colors: { O: "#3f8f5c", o: "#25603a" },
    },
    {
      id: "ink",
      name: "Ink",
      unlockedBy: "samurai",
      swatch: "#2f3646",
      colors: { O: "#2f3646", o: "#1b2030" },
    },
    {
      id: "paper",
      name: "Paper",
      unlockedBy: "kensei",
      swatch: "#d8d2c2",
      colors: { O: "#d8d2c2", o: "#9d9684" },
    },
  ],
  hakama: [
    {
      id: "olive",
      name: "Olive",
      unlockedBy: "ashigaru",
      swatch: "#6d7a68",
      colors: { P: "#6d7a68", p: "#4a5449" },
    },
    {
      id: "charcoal",
      name: "Charcoal",
      unlockedBy: "bushi",
      swatch: "#4d525c",
      colors: { P: "#4d525c", p: "#33373f" },
    },
    {
      id: "rust",
      name: "Rust",
      unlockedBy: "ronin",
      swatch: "#8a5a41",
      colors: { P: "#8a5a41", p: "#5e3b29" },
    },
    {
      id: "indigo-deep",
      name: "Deep indigo",
      unlockedBy: "samurai",
      swatch: "#3d4a66",
      colors: { P: "#3d4a66", p: "#28324a" },
    },
    {
      id: "snow",
      name: "Snow",
      unlockedBy: "kensei",
      swatch: "#b9bcb4",
      colors: { P: "#b9bcb4", p: "#8a8d84" },
    },
  ],
};

export const AVATAR_SLOTS: AvatarSlot[] = ["hat", "robe", "obi", "hakama"];

export type AvatarChoice = Record<AvatarSlot, string>;

export function defaultAvatar(): AvatarChoice {
  return { hat: "straw", robe: "indigo", obi: "blood", hakama: "olive" };
}

function rankIndex(rankId: string): number {
  return RANKS.findIndex((rank) => rank.id === rankId);
}

/**
 * An unknown rank id sorts last, so an option referencing a rank that has been
 * renamed stays locked rather than silently unlocking for everyone.
 */
export function isUnlocked(option: AvatarOption, currentRankId: string): boolean {
  const required = rankIndex(option.unlockedBy);
  const held = rankIndex(currentRankId);
  if (required < 0) return false;
  return held >= required;
}

export function optionsFor(slot: AvatarSlot): AvatarOption[] {
  return AVATAR_OPTIONS[slot];
}

export function findOption(slot: AvatarSlot, id: string): AvatarOption | undefined {
  return AVATAR_OPTIONS[slot].find((option) => option.id === id);
}

/**
 * Resolve a choice into the colour map the sprite renders against.
 *
 * A choice naming an option that no longer exists, or one the learner has not
 * unlocked, falls back to that slot's default rather than rendering a sprite
 * with missing colours. Pixels with no colour are dropped by the renderer, so
 * the failure mode would be a ronin with holes in it.
 */
export function resolvePalette(
  choice: AvatarChoice,
  currentRankId: string,
): Record<string, string> {
  const palette = { ...BASE_PALETTE };

  for (const slot of AVATAR_SLOTS) {
    const chosen = findOption(slot, choice[slot]);
    const usable =
      chosen && isUnlocked(chosen, currentRankId)
        ? chosen
        : findOption(slot, defaultAvatar()[slot]);
    Object.assign(palette, usable?.colors ?? {});
  }

  return palette;
}

/** Coerce stored or URL-supplied data into a choice, keeping only known ids. */
export function normalizeAvatar(raw: unknown): AvatarChoice {
  const fallback = defaultAvatar();
  if (!raw || typeof raw !== "object") return fallback;

  const candidate = raw as Partial<Record<AvatarSlot, unknown>>;
  const result = { ...fallback };

  for (const slot of AVATAR_SLOTS) {
    const value = candidate[slot];
    if (typeof value === "string" && findOption(slot, value)) {
      result[slot] = value;
    }
  }

  return result;
}
