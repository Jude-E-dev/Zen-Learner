"use client";

import { AvatarPicker } from "@/components/AvatarPicker";
import type { AvatarChoice } from "@/lib/game/avatar";

/**
 * The armoury, in the one place both screens read it from.
 *
 * It started out inline on the home page, which is also how the play screen
 * ended up with no way to reach it: a learner who had started a session could
 * not change their ronin without backing out of the browser, because the whole
 * play flow had no navigation in it at all.
 */
export function ArmouryPanel({
  choice,
  currentRankId,
  onChange,
  onClose,
  note = "RANK UP TO UNLOCK · ESC TO CLOSE",
}: {
  choice: AvatarChoice;
  currentRankId: string;
  onChange: (next: AvatarChoice) => void;
  onClose: () => void;
  note?: string;
}) {
  return (
    <section className="pixel-frame bg-ink-soft shrink-0 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-bitmap text-gold text-lg tracking-widest">ARMOURY</h2>
        <p className="text-paper-dim text-label tracking-widest">{note}</p>
      </div>

      <AvatarPicker
        choice={choice}
        currentRankId={currentRankId}
        onChange={onChange}
      />

      <button
        type="button"
        onClick={onClose}
        className="focus-ring pixel-frame text-paper mt-5 bg-ink px-4 py-2 text-xs tracking-widest hover:border-gold"
      >
        DONE
      </button>
    </section>
  );
}
