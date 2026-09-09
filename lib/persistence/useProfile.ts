"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState } from "../game/session";
import { createStore, emptyProfile, type Profile, type Store } from "./store";
import { mergeSession } from "./profile";
import type { AvatarChoice } from "../game/avatar";
import { spendPause } from "../tutor/quota";

/**
 * Loads the durable profile once, then hands back a commit function for the
 * end of a session.
 *
 * `durable` is surfaced rather than hidden: when IndexedDB is unavailable the
 * app stays fully playable, but the learner is told their progress will not be
 * saved instead of discovering it after a session they cared about.
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [ready, setReady] = useState(false);
  const [durable, setDurable] = useState(true);
  const storeRef = useRef<Store | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const store = await createStore();
      const loaded = await store.loadProfile();
      if (cancelled) return;
      storeRef.current = store;
      setProfile(loaded);
      setDurable(store.durable);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const commitSession = useCallback(async (state: SessionState) => {
    const store = storeRef.current;
    if (!store) return;

    const before = await store.loadProfile();
    const merged = mergeSession(before, state);
    await store.saveProfile(merged);
    // The session number is the one that just finished.
    await store.appendEvents(merged.sessions, state.events);
    setProfile(merged);
  }, []);

  /**
   * Saving the avatar reloads the profile first for the same reason
   * commitSession does: the picker and a finishing session can both be writing,
   * and the last write must not roll back the other's fields.
   */
  const saveAvatar = useCallback(async (avatar: AvatarChoice) => {
    setProfile((current) => ({ ...current, avatar }));
    const store = storeRef.current;
    if (!store) return;
    const before = await store.loadProfile();
    await store.saveProfile({ ...before, avatar });
  }, []);

  /**
   * Count one AI-tutored pause against today's quota.
   *
   * Optimistic locally so the UI can gate on it immediately, then reconciled
   * against the stored profile — the same reload-first shape as the two
   * writers above, because a session ending mid-pause must not roll the
   * counter back and hand out a free pause.
   */
  const spendTutorPause = useCallback(async () => {
    setProfile((current) => ({
      ...current,
      pauseQuota: spendPause(current.pauseQuota),
    }));
    const store = storeRef.current;
    if (!store) return;
    const before = await store.loadProfile();
    await store.saveProfile({
      ...before,
      pauseQuota: spendPause(before.pauseQuota),
    });
  }, []);

  const exportEvents = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return [];
    return store.readEvents();
  }, []);

  return {
    profile,
    ready,
    durable,
    commitSession,
    saveAvatar,
    spendTutorPause,
    exportEvents,
  };
}
