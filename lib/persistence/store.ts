import type { GameEvent } from "../game/events";
import { emptyMastery, type MasteryStats } from "../game/ranks";
import { defaultAvatar, normalizeAvatar, type AvatarChoice } from "../game/avatar";
import { emptyQuota, normalizeQuota, type PauseQuota } from "../tutor/quota";

/**
 * Persistence behind an interface.
 *
 * Two implementations satisfy it today — IndexedDB and memory — and a
 * server-backed one could drop in later without game logic noticing. That is
 * not speculative abstraction: the memory implementation is load-bearing right
 * now, because IndexedDB genuinely is unavailable in some private-browsing
 * modes and the app has to stay playable there.
 */

export const PROFILE_VERSION = 3;

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
  /** AI-tutored pauses spent today. Added in version 3. */
  pauseQuota: PauseQuota;
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
    pauseQuota: emptyQuota(),
  };
}

export interface StoredEvent {
  /** Which session this event belongs to, so sessions can be compared. */
  session: number;
  event: GameEvent;
}

/**
 * How many sessions of events the store keeps.
 *
 * Nothing else ever removes an event, so uncapped the store grows for the life
 * of the browser profile and ends up competing with the progress record for the
 * origin's storage quota. Eviction is origin-wide and does not spare the
 * profile, so losing that fight costs the learner their rank and streak —
 * rotating here keeps the only data at risk the kind that regenerates by
 * playing.
 *
 * Fifty is well clear of what the live hypothesis needs: the session-1 vs
 * session-5 comparison (design doc #7) holds until a fifty-first session
 * exists, long after that question has been answered.
 */
export const RETAINED_SESSIONS = 50;

/**
 * The oldest session number still worth keeping, or null when nothing is over
 * the cap.
 *
 * Rotation counts sessions, never rows: half a session still reads as a whole
 * session to the report, which would describe a thirty-question run as a
 * four-question one and dent exactly the curve these events exist to measure.
 * Sessions age out whole or not at all.
 *
 * Session numbers come from the profile's own counter, so they arrive in order;
 * this sorts anyway rather than assuming it, because the only cost is on a list
 * that is already bounded and the failure mode would be deleting the wrong end.
 */
export function retentionCutoff(
  sessions: number[],
  keep = RETAINED_SESSIONS,
): number | null {
  const distinct = [...new Set(sessions)].sort((a, b) => a - b);
  if (distinct.length <= keep) return null;
  return distinct[distinct.length - keep];
}

export interface Store {
  /** True when writes actually survive a reload. */
  readonly durable: boolean;
  loadProfile(): Promise<Profile>;
  saveProfile(profile: Profile): Promise<void>;
  /** Appends a batch, then rotates everything past RETAINED_SESSIONS away. */
  appendEvents(session: number, events: GameEvent[]): Promise<void>;
  /** The retained window, oldest first — not necessarily from session 1. */
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
      const next = [...events, ...batch.map((event) => ({ session, event }))];
      /*
       * The fallback rotates on the same rule as the durable store. If it did
       * not, readEvents() would mean two different things depending on the
       * browser, and every test in this repo drives the lenient one.
       */
      const cutoff = retentionCutoff(next.map((row) => row.session));
      events = cutoff === null ? next : next.filter((row) => row.session >= cutoff);
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
 * Version 2 added the avatar; version 3 added the daily pause quota. Every
 * other field is unchanged, so an older profile upgrades by filling in a
 * default rather than starting over — a learner who has ground their way to
 * Samurai must not lose it to a cosmetic feature or a spend counter. Only a
 * version from the future is still treated as unreadable, because that shape
 * genuinely is unknown to this build.
 *
 * A missing quota normalizes to "nothing spent today", which is the generous
 * reading. The alternative — treating an absent counter as exhausted — would
 * silently switch the tutor off for every existing profile on upgrade.
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
    pauseQuota: normalizeQuota(candidate.pauseQuota),
  };
}

const DB_NAME = "zen-mode";
const DB_VERSION = 1;
const PROFILE_STORE = "profile";
const EVENT_STORE = "events";
const PROFILE_KEY = "singleton";

/** What the events store actually holds: a StoredEvent plus its in-line key. */
interface EventRow extends StoredEvent {
  id: number;
}

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
      /**
       * Append, then rotate — in one transaction, so the cap is never briefly
       * untrue and a failure takes both halves with it rather than leaving a
       * write that never got pruned. Session commit is the only writer, so this
       * is also where a store that predates the cap gets trimmed: on the first
       * session finished after this ships, however many are backed up.
       *
       * The rows are read rather than reached through an index on `session`,
       * because an index means a DB_VERSION bump against profiles that already
       * exist, and this pass runs once per session over a set it is itself
       * keeping bounded. Deleting rows needs no schema change, so the version
       * stays where it is.
       */
      async appendEvents(session, batch) {
        const tx = db.transaction(EVENT_STORE, "readwrite");
        const stored = (await tx.store.getAll()) as EventRow[];

        const sessions = stored.map((row) => row.session);
        // An empty batch records no session, so it must not claim one.
        if (batch.length > 0) sessions.push(session);
        const cutoff = retentionCutoff(sessions);
        const stale =
          cutoff === null ? [] : stored.filter((row) => row.session < cutoff);

        await Promise.all([
          ...batch.map((event) => tx.store.add({ session, event })),
          ...stale.map((row) => tx.store.delete(row.id)),
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
