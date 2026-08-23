import { describe, expect, it } from "bun:test";
import { SingleFlight } from "./single-flight";

describe("SingleFlight", () => {
  it("shares an active operation and starts a fresh one after completion", async () => {
    const singleFlight = new SingleFlight<object, number>();
    const owner = {};
    let calls = 0;
    let resolveOperation: ((value: number) => void) | undefined;
    const operation = () => {
      calls += 1;
      return new Promise<number>((resolve) => {
        resolveOperation = resolve;
      });
    };

    const first = singleFlight.run(owner, "key", operation);
    const second = singleFlight.run(owner, "key", operation);

    expect(first).toBe(second);
    await Promise.resolve();
    expect(calls).toBe(1);
    resolveOperation?.(42);
    await expect(first).resolves.toBe(42);

    const third = singleFlight.run(owner, "key", async () => 43);
    expect(third).not.toBe(first);
    await expect(third).resolves.toBe(43);
  });

  it("clears failed operations so callers can retry", async () => {
    const singleFlight = new SingleFlight<object, number>();
    const owner = {};
    const failure = new Error("temporary failure");

    const first = singleFlight.run(owner, "key", async () => {
      throw failure;
    });
    const second = singleFlight.run(owner, "key", async () => 1);

    expect(second).toBe(first);
    await expect(first).rejects.toBe(failure);
    await expect(singleFlight.run(owner, "key", async () => 2)).resolves.toBe(
      2,
    );
  });
});
