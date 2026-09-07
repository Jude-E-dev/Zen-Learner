import type { GameEvent } from "../game/events";
import { emptyMastery, type MasteryStats } from "../game/ranks";

/**
 * Persistence behind an interface.
 *
 * Two implementations satisfy it today — IndexedDB and memory — and a
 * server-backed one could drop in later without game logic noticing. That is
 * not speculative abstraction: the memory implementation is load-bearing right
 * now, because IndexedDB genuinely is unavailable in some private-browsing
 * modes and the app has to stay playable there.
 */

export const PROFILE_VERSION = 1;

export interface Profile {
  version: number;
  totalXp: number;
  bestStreak: number;
  /** Lifetime per-tier accuracy. Ranks are derived from this, never stored. */
  mastery: MasteryStats;
  /** Completed sessions, for the session-1 vs session-5 comparison. */
  sessions: number;
  lastSessionAt: number | null;
}

export function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    totalXp: 0,
    bestStreak: 0,
    mastery: emptyMastery(),
    sessions: 0,
    lastSessionAt: null,
  };
}

export interface StoredEvent {
  /** Which session this event belongs to, so sessions can be compared. */
  session: number;
  event: GameEvent;
}

export interface Store {
  /** True when writes actually survive a reload. */
  readonly durable: boolean;
  loadProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;
  appendEvents(session: number, events: GameEvent[]): Promise<void>;
  readEvents(): Promise<StoredEvent[]>;
  clear(): Promise<void>;
}

/** Non-durable fallback. Everything works; nothing survives a reload. */
export function memoryStore(): Store {
  let profile = emptyProfile();
  let events: StoredEvent[] = [];

  return {
    durable: false,
    async loadProfile() {
      return profile;
    },
    async saveProfile(next) {
      profile = next;
    },
    async appendEvents(session, batch) {
      events = [...events, ...batch.map((event) => ({ session, event }))];
    },
    async readEvents() {
      return events;
    },
    async clear() {
      profile = emptyProfile();
      events = [];
    },
  };
}

function migrate(raw: unknown): Profile {
  if (!raw || typeof raw !== "object") return emptyProfile();
  const candidate = raw as Partial<Profile>;
  // Only one version exists so far. An unknown version means data written by a
  // newer build; starting clean beats crashing on a shape we can't read.
  if (candidate.version !== PROFILE_VERSION) return emptyProfile();
  return {
    version: PROFILE_VERSION,
    totalXp: candidate.totalXp ?? 0,
    bestStreak: candidate.bestStreak ?? 0,
    mastery: candidate.mastery ?? emptyMastery(),
    sessions: candidate.sessions ?? 0,
    lastSessionAt: candidate.lastSessionAt ?? null,
  };
}

const DB_NAME = "zen-mode";
const DB_VERSION = 1;
const PROFILE_STORE = "profile";
const EVENT_STORE = "events";
const PROFILE_KEY = "singleton";

/**
 * Probe IndexedDB by actually opening it rather than checking for the global.
 * Private-browsing modes expose `indexedDB` and then reject the open, so
 * presence proves nothing.
 */
export async function createStore(): Promise<Store> {
  if (typeof indexedDB === "undefined") return memoryStore();

  try {
    const { openDB } = await import("idb");
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(PROFILE_STORE)) {
          database.createObjectStore(PROFILE_STORE);
        }
        if (!database.objectStoreNames.contains(EVENT_STORE)) {
          database.createObjectStore(EVENT_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      },
    });

    return {
      durable: true,
      async loadProfile() {
        return migrate(await db.get(PROFILE_STORE, PROFILE_KEY));
      },
      async saveProfile(profile) {
        await db.put(PROFILE_STORE, profile, PROFILE_KEY);
      },
      async appendEvents(session, batch) {
        const tx = db.transaction(EVENT_STORE, "readwrite");
        await Promise.all([
          ...batch.map((event) => tx.store.add({ session, event })),
          tx.done,
        ]);
      },
      async readEvents() {
        const rows = (await db.getAll(EVENT_STORE)) as StoredEvent[];
        return rows;
      },
      async clear() {
        await db.clear(PROFILE_STORE);
        await db.clear(EVENT_STORE);
      },
    };
  } catch {
    // Blocked, quota-denied, or otherwise unavailable. Stay playable.
    return memoryStore();
  }
}
