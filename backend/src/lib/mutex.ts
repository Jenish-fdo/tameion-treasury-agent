/**
 * Minimal async mutex: tasks run one at a time, in the order they were submitted.
 * Used to serialise credential mints (per-holder registry nonces and the relayer's tx nonce are
 * read-then-used, so concurrent mints in one process would race).
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  /** Runs `task` after every previously submitted task has settled. A failing task does not block the queue. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
