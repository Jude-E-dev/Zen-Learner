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
export type AvatarSlot = "hat" | "robe" | "obi";

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
  f: "#c9a88a", // face
  e: "#12151d", // the eye-line under the brim
  g: "#c9a88a", // hands
  S: "#d9c88a", // straw binding on the post
  P: "#7a5a3a", // post timber
  R: "#cbb27a", // rope
};

export const AVATAR_OPTIONS: Record<AvatarSlot, AvatarOption[]> = {
  hat: [
    {
      id: "straw",
      name: "Straw",
      unlockedBy: "ashigaru",
      swatch: "#d9c88a",
      colors: { K: "#d9c88a", k: "#b0a06a" },
    },
    {
      id: "ash",
      name: "Ash",
      unlockedBy: "bushi",
      swatch: "#9aa0a8",
      colors: { K: "#9aa0a8", k: "#6f757d" },
    },
    {
      id: "lacquer",
      name: "Lacquer",
      unlockedBy: "ronin",
      swatch: "#2f3340",
      colors: { K: "#2f3340", k: "#1b1e27" },
    },
    {
      id: "crimson",
      name: "Crimson",
      unlockedBy: "samurai",
      swatch: "#b03a3f",
      colors: { K: "#b03a3f", k: "#7d272b" },
    },
    {
      id: "gilt",
      name: "Gilt",
      unlockedBy: "kensei",
      swatch: "#e0b64a",
      colors: { K: "#e0b64a", k: "#a8842f" },
    },
  ],
  robe: [
    {
      id: "indigo",
      name: "Indigo",
      unlockedBy: "ashigaru",
      swatch: "#3b4a6b",
      colors: { H: "#3b4a6b", h: "#2a3550", A: "#31405e" },
    },
    {
      id: "slate",
      name: "Slate",
      unlockedBy: "bushi",
      swatch: "#444c58",
      colors: { H: "#444c58", h: "#2f353e", A: "#3a424d" },
    },
    {
      id: "moss",
      name: "Moss",
      unlockedBy: "ronin",
      swatch: "#3d5442",
      colors: { H: "#3d5442", h: "#2a3b2e", A: "#34483a" },
    },
    {
      id: "plum",
      name: "Plum",
      unlockedBy: "samurai",
      swatch: "#4c3550",
      colors: { H: "#4c3550", h: "#35243a", A: "#422e46" },
    },
    {
      id: "bone",
      name: "Bone",
      unlockedBy: "kensei",
      swatch: "#8d8676",
      colors: { H: "#8d8676", h: "#655f53", A: "#7b7466" },
    },
  ],
  obi: [
    {
      id: "blood",
      name: "Blood",
      unlockedBy: "ashigaru",
      swatch: "#e5484d",
      colors: { O: "#e5484d" },
    },
    {
      id: "gold",
      name: "Gold",
      unlockedBy: "bushi",
      swatch: "#f5b544",
      colors: { O: "#f5b544" },
    },
    {
      id: "jade",
      name: "Jade",
      unlockedBy: "ronin",
      swatch: "#4ade80",
      colors: { O: "#4ade80" },
    },
    {
      id: "ink",
      name: "Ink",
      unlockedBy: "samurai",
      swatch: "#1d2230",
      colors: { O: "#1d2230" },
    },
    {
      id: "paper",
      name: "Paper",
      unlockedBy: "kensei",
      swatch: "#e8e4d9",
      colors: { O: "#e8e4d9" },
    },
  ],
};

export const AVATAR_SLOTS: AvatarSlot[] = ["hat", "robe", "obi"];

export type AvatarChoice = Record<AvatarSlot, string>;

export function defaultAvatar(): AvatarChoice {
  return { hat: "straw", robe: "indigo", obi: "blood" };
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
