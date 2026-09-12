"use client";

import {
  AVATAR_SLOTS,
  findOption,
  isUnlocked,
  optionsFor,
  type AvatarChoice,
  type AvatarSlot,
} from "@/lib/game/avatar";
import { RANKS } from "@/lib/game/ranks";

/**
 * The armoury.
 *
 * Three slots, five options each, unlocked by rank. Locked options stay
 * visible and say what earns them — hiding them would mean the reward for
 * reaching Ronin is a surprise nobody was working toward. A row of ghosts you
 * can see is what makes the next rank worth something.
 */

const SLOT_LABELS: Record<AvatarSlot, string> = {
  hat: "HAT",
  robe: "KIMONO",
  obi: "OBI",
  hakama: "HAKAMA",
};

function rankName(id: string): string {
  return RANKS.find((rank) => rank.id === id)?.name ?? id;
}

export function AvatarPicker({
  choice,
  currentRankId,
  onChange,
}: {
  choice: AvatarChoice;
  currentRankId: string;
  onChange: (next: AvatarChoice) => void;
}) {
  return (
    /*
      Side by side once there is width for it. Stacked, three slots plus the
      DONE button are taller than the space the play screen has left over, so
      opening the armoury mid-session showed a picker cut off at the second row.
    */
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-x-10">
      {AVATAR_SLOTS.map((slot) => {
        const selected = findOption(slot, choice[slot]);

        return (
          <fieldset key={slot} className="flex flex-col gap-2">
            <legend className="text-paper-dim text-label tracking-label">
              {SLOT_LABELS[slot]}
              <span className="text-paper ml-3">{selected?.name ?? "—"}</span>
            </legend>

            <div className="flex flex-wrap gap-2">
              {optionsFor(slot).map((option) => {
                const unlocked = isUnlocked(option, currentRankId);
                const active = choice[slot] === option.id;

                return (
                  <div key={option.id} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      disabled={!unlocked}
                      aria-pressed={active}
                      onClick={() => onChange({ ...choice, [slot]: option.id })}
                      className={`focus-ring relative h-9 w-9 border-2 ${
                        active ? "border-jade" : "border-ink-line"
                      } ${unlocked ? "cursor-pointer" : "cursor-not-allowed opacity-30"}`}
                      style={{ backgroundColor: option.swatch }}
                    >
                      {/* A locked swatch is struck through rather than blanked,
                          so the colour it will become is still readable. */}
                      {!unlocked && (
                        <span
                          aria-hidden
                          className="bg-ink absolute left-1/2 top-1/2 h-[2px] w-10 -translate-x-1/2 -translate-y-1/2 rotate-45"
                        />
                      )}
                      <span className="sr-only">
                        {option.name}
                        {unlocked ? "" : ` — locked, reach ${rankName(option.unlockedBy)}`}
                      </span>
                    </button>

                    {/* What earns it, on the swatch itself. Leaving this to a
                        hover title meant the only way to find out was to go
                        looking, which is not how a reward should read. */}
                    <span
                      aria-hidden
                      className={`text-label tracking-label ${
                        unlocked ? "text-paper-dim" : "text-gold-mute"
                      }`}
                    >
                      {unlocked ? option.name.toUpperCase() : rankName(option.unlockedBy).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
