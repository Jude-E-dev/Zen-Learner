"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState } from "../game/session";
import { createStore, emptyProfile, type Profile, type Store } from "./store";
import { mergeSession } from "./profile";

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

  const exportEvents = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return [];
    return store.readEvents();
  }, []);

  return { profile, ready, durable, commitSession, exportEvents };
}
