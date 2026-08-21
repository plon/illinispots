import { describe, expect, it } from "bun:test";
import {
  CLIENT_TRACE_PROPAGATION_TARGETS,
  resolveClientSentryEnvironment,
} from "./observability";

describe("resolveClientAppEnvironment", () => {
  it("prefers explicit VITE_APP_ENV", () => {
    expect(
      resolveClientSentryEnvironment({
        VITE_APP_ENV: "staging",
        MODE: "production",
      }),
    ).toBe("staging");
  });

  it("falls back to Vite MODE or development", () => {
    expect(resolveClientSentryEnvironment({ MODE: "production" })).toBe(
      "production",
    );
    expect(resolveClientSentryEnvironment({ MODE: "development" })).toBe(
      "development",
    );
  });
});

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
