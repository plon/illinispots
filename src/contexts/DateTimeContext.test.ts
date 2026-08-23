import { describe, expect, it } from "bun:test";
import {
  millisecondsUntilNextMinute,
  startOfMinute,
} from "./DateTimeContext";

describe("live date/time helpers", () => {
  it("normalizes selected timestamps to the start of a minute", () => {
    expect(startOfMinute(new Date("2026-08-23T12:34:56.789Z")).toISOString()).toBe(
      "2026-08-23T12:34:00.000Z",
    );
  });

  it("schedules the next update on the exact minute boundary", () => {
    expect(
      millisecondsUntilNextMinute(new Date("2026-08-23T12:34:56.789Z")),
    ).toBe(3_211);
    expect(
      millisecondsUntilNextMinute(new Date("2026-08-23T12:35:00.000Z")),
    ).toBe(60_000);
  });
});
