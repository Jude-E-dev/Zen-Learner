import type { GameEvent } from "../game/events";
import { emptyMastery, type MasteryStats } from "../game/ranks";
import { defaultAvatar, normalizeAvatar, type AvatarChoice } from "../game/avatar";

/**
 * Persistence behind an interface.
 *
 * Two implementations satisfy it today — IndexedDB and memory — and a
 * server-backed one could drop in later without game logic noticing. That is
 * not speculative abstraction: the memory implementation is load-bearing right
 * now, because IndexedDB genuinely is unavailable in some private-browsing
 * modes and the app has to stay playable there.
 */

export const PROFILE_VERSION = 2;

export interface Profile {
  version: number;
  totalXp: number;
  bestStreak: number;
  /** Lifetime per-tier accuracy. Ranks are derived from this, never stored. */
  mastery: MasteryStats;
  /** Completed sessions, for the session-1 vs session-5 comparison. */
  sessions: number;
  lastSessionAt: number | null;
  /** How the learner has dressed their ronin. Added in version 2. */
  avatar: AvatarChoice;
}

export function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    totalXp: 0,
    bestStreak: 0,
    mastery: emptyMastery(),
    sessions: 0,
    lastSessionAt: null,
    avatar: defaultAvatar(),
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

/**
 * Stored mastery is the one field the app will crash on if it is the wrong
 * shape: rankFor reads stats.perTier and every screen derives a rank on
 * mount. While an unrecognised version reset the whole profile this was
 * guarded by accident; now that version 1 profiles are carried forward, the
 * shape has to be checked on the way in.
 *
 * Per-tier records are rebuilt field by field rather than trusted wholesale,
 * so a half-written record cannot turn into NaN totals downstream.
 */
function migrateMastery(raw: unknown): MasteryStats {
  if (!raw || typeof raw !== "object") return emptyMastery();
  const perTier = (raw as Partial<MasteryStats>).perTier;
  if (!perTier || typeof perTier !== "object") return emptyMastery();

  const clean: Record<number, { answered: number; correct: number }> = {};
  for (const [tier, record] of Object.entries(perTier)) {
    const key = Number(tier);
    if (!Number.isFinite(key)) continue;
    if (!record || typeof record !== "object") continue;
    const { answered, correct } = record as Partial<{ answered: number; correct: number }>;
    if (!Number.isFinite(answered) || !Number.isFinite(correct)) continue;
    clean[key] = { answered: answered as number, correct: correct as number };
  }

  return { perTier: clean };
}

/**
 * Version 2 added the avatar. Every other field is unchanged, so a version 1
 * profile upgrades by filling in a default rather than starting over — a
 * learner who has ground their way to Samurai must not lose it to a cosmetic
 * feature. Only a version from the future is still treated as unreadable,
 * because that shape genuinely is unknown to this build.
 */
export function migrate(raw: unknown): Profile {
  if (!raw || typeof raw !== "object") return emptyProfile();
  const candidate = raw as Partial<Profile>;
  if (typeof candidate.version !== "number") return emptyProfile();
  if (candidate.version > PROFILE_VERSION) return emptyProfile();
  return {
    version: PROFILE_VERSION,
    totalXp: candidate.totalXp ?? 0,
    bestStreak: candidate.bestStreak ?? 0,
    mastery: migrateMastery(candidate.mastery),
    sessions: candidate.sessions ?? 0,
    lastSessionAt: candidate.lastSessionAt ?? null,
    avatar: normalizeAvatar(candidate.avatar),
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
