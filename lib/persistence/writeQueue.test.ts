import { describe, expect, it } from "vitest";
import { createWriteQueue } from "./writeQueue";

/**
 * Regression coverage for the useProfile race (red-team finding): commitSession,
 * saveAvatar and spendTutorPause each load-mutate-save the same record, and an
 * overlapping pair used to let the later save's stale snapshot silently discard
 * the other's change. These tests prove the queue itself enforces serialization
 * without needing to render the hook.
 */
describe("createWriteQueue", () => {
  it("runs a second write only after the first resolves, in call order", async () => {
    const order: string[] = [];
    const enqueue = createWriteQueue();

    const first = enqueue(async () => {
      order.push("first:start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("first:end");
    });
    const second = enqueue(async () => {
      order.push("second:start");
      order.push("second:end");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("prevents a stale load-mutate-save from clobbering the other write", async () => {
    // Simulates the exact bug: two writers share one "store" and each does a
    // load, mutate, save. Interleaved without the queue, the slower write's
    // save wins with a stale `before` and drops the other field.
    let stored = { avatar: "starter", pauseQuota: 5 };
    const load = async () => stored;
    const save = async (next: typeof stored) => {
      stored = next;
    };
    const enqueue = createWriteQueue();

    const spendPause = enqueue(async () => {
      const before = await load();
      await new Promise((r) => setTimeout(r, 10));
      await save({ ...before, pauseQuota: before.pauseQuota - 1 });
    });
    const changeAvatar = enqueue(async () => {
      const before = await load();
      await save({ ...before, avatar: "armoured" });
    });

    await Promise.all([spendPause, changeAvatar]);
    expect(stored).toEqual({ avatar: "armoured", pauseQuota: 4 });
  });

  it("keeps processing later writes after an earlier one throws", async () => {
    const enqueue = createWriteQueue();
    let ran = false;
    const failing = enqueue(async () => {
      throw new Error("write failed");
    });
    const after = enqueue(async () => {
      ran = true;
    });

    await expect(failing).rejects.toThrow("write failed");
    await after;
    expect(ran).toBe(true);
  });
});
