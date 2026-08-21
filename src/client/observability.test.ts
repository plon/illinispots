import { describe, expect, it } from "bun:test";
import {
  CLIENT_TRACE_PROPAGATION_TARGETS,
  resolveClientSentryEnvironment,
} from "./observability";

describe("resolveClientSentryEnvironment", () => {
  it("uses the Vercel target so custom environments retain their name", () => {
    expect(
      resolveClientSentryEnvironment({
        VITE_VERCEL_TARGET_ENV: "staging",
        VITE_VERCEL_ENV: "preview",
        MODE: "production",
      }),
    ).toBe("staging");
  });

  it("falls back through the standard Vercel and Vite environments", () => {
    expect(
      resolveClientSentryEnvironment({
        VITE_VERCEL_ENV: "preview",
        MODE: "production",
      }),
    ).toBe("preview");
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
    expect(matchesTraceTarget("/api/facilities")).toBe(true);
    expect(matchesTraceTarget("/api/room-schedule")).toBe(true);
    expect(matchesTraceTarget("https://illinispots.com/api/facilities")).toBe(
      true,
    );
    expect(
      matchesTraceTarget("https://www.illinispots.com/api/facilities"),
    ).toBe(true);
    expect(matchesTraceTarget("https://api.mapbox.com/v4/tiles")).toBe(false);
  });
});
