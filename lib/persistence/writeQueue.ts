/**
 * Serializes a set of async writers against shared state.
 *
 * Pulled out of useProfile so the ordering guarantee — each writer's own
 * load-mutate-save runs to completion before the next one starts, in call
 * order, regardless of how long any individual write takes — is testable
 * without rendering a hook.
 */
export function createWriteQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue(write: () => Promise<void>): Promise<void> {
    const next = tail.then(write, write);
    // The queue itself must never become a rejected promise, or every write
    // after a failed one would silently skip — chain a swallowed copy for
    // that purpose and return the real (possibly rejecting) one to the caller.
    tail = next.catch(() => {});
    return next;
  };
}
