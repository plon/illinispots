/**
 * Coalesces concurrent calls for the same owner/key without caching completed
 * values. The owner is weakly held so injected clients and test doubles can be
 * garbage collected normally.
 */
export class SingleFlight<Owner extends object, Result> {
  readonly #activeByOwner = new WeakMap<
    Owner,
    Map<string, Promise<Result>>
  >();

  run(
    owner: Owner,
    key: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    let activeByKey = this.#activeByOwner.get(owner);
    if (!activeByKey) {
      activeByKey = new Map();
      this.#activeByOwner.set(owner, activeByKey);
    }

    const active = activeByKey.get(key);
    if (active) return active;

    // Deferring operation by one microtask ensures the tracked promise is in
    // the map before even a synchronously-throwing operation can settle.
    const operationPromise = Promise.resolve().then(operation);

    const clear = () => {
      if (activeByKey?.get(key) !== trackedPromise) return;

      activeByKey.delete(key);
      if (activeByKey.size === 0) {
        this.#activeByOwner.delete(owner);
      }
    };

    const trackedPromise = operationPromise.then(
      (value) => {
        clear();
        return value;
      },
      (error) => {
        clear();
        throw error;
      },
    );
    activeByKey.set(key, trackedPromise);
    return trackedPromise;
  }
}
