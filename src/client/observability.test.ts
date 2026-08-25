import { describe, expect, it } from "bun:test";
import {
  CLIENT_TRACE_PROPAGATION_TARGETS,
  shouldCreateClientRequestSpan,
} from "./observability";

function matchesTraceTarget(
  url: string,
  targets = CLIENT_TRACE_PROPAGATION_TARGETS,
): boolean {
  return targets.some((target) =>
    typeof target === "string" ? url.includes(target) : target.test(url),
  );
}

describe("CLIENT_TRACE_PROPAGATION_TARGETS", () => {
  it("matches same-origin, relative, and production domain requests", () => {
    expect(matchesTraceTarget("http://localhost:5173/api/facilities")).toBe(true);
    expect(matchesTraceTarget("http://localhost/api/facilities")).toBe(true);
    expect(matchesTraceTarget("http://127.0.0.1:3000/api/facilities")).toBe(true);
    expect(matchesTraceTarget("/api/facilities")).toBe(true);
    expect(matchesTraceTarget("/api/room-schedule")).toBe(true);
    expect(matchesTraceTarget("https://illinispots.com/api/facilities")).toBe(
      true,
    );
    expect(
      matchesTraceTarget("https://www.illinispots.com/api/facilities"),
    ).toBe(true);
    expect(
      matchesTraceTarget("https://staging.illinispots.com/api/facilities"),
    ).toBe(true);
    expect(
      matchesTraceTarget("https://illinispots.fly.dev/api/facilities"),
    ).toBe(true);
    expect(
      matchesTraceTarget("https://illinispots-staging.fly.dev/api/facilities"),
    ).toBe(true);
    expect(matchesTraceTarget("//attacker.example/api/facilities")).toBe(false);
    expect(matchesTraceTarget("https://unrelated.fly.dev/api/facilities")).toBe(
      false,
    );
    expect(matchesTraceTarget("https://api.mapbox.com/v4/tiles")).toBe(false);
    expect(
      matchesTraceTarget("https://api.mapbox.com/search?q=localhost"),
    ).toBe(false);
    expect(matchesTraceTarget("https://localhost.attacker.com/api")).toBe(
      false,
    );
    expect(
      matchesTraceTarget("https://illinispots.com.attacker.example/api"),
    ).toBe(false);
    expect(
      matchesTraceTarget("https://www.illinispots.com.attacker.example/api"),
    ).toBe(false);
    expect(
      matchesTraceTarget("https://fly.dev.attacker.example/api"),
    ).toBe(false);
  });
});

describe("shouldCreateClientRequestSpan", () => {
  it("filters Mapbox requests", () => {
    expect(
      shouldCreateClientRequestSpan(
        "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/16/1/2.vector.pbf",
      ),
    ).toBe(false);
    expect(
      shouldCreateClientRequestSpan("https://events.mapbox.com/events/v2"),
    ).toBe(false);
  });

  it("keeps application and unrelated third-party requests", () => {
    expect(shouldCreateClientRequestSpan("/api/facilities")).toBe(true);
    expect(
      shouldCreateClientRequestSpan("https://illinispots.com/api/facilities"),
    ).toBe(true);
    expect(
      shouldCreateClientRequestSpan("https://mapbox.com.example.com/tiles"),
    ).toBe(true);
  });
});
