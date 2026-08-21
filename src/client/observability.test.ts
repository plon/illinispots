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

describe("CLIENT_TRACE_PROPAGATION_TARGETS", () => {
  it("matches same-origin, relative, and production domain requests", () => {
    const targets = CLIENT_TRACE_PROPAGATION_TARGETS;

    expect(targets).toContain("localhost");

    const relativePattern = targets.find(
      (target) => target instanceof RegExp && target.source === "^\\/",
    );
    expect(relativePattern).toBeDefined();
    expect((relativePattern as RegExp).test("/api/facilities")).toBe(true);
    expect((relativePattern as RegExp).test("/api/room-schedule")).toBe(true);

    const domainPattern = targets.find(
      (target) =>
        target instanceof RegExp &&
        target.source === "^https:\\/\\/(?:www\\.)?illinispots\\.com",
    );
    expect(domainPattern).toBeDefined();
    expect(
      (domainPattern as RegExp).test(
        "https://illinispots.com/api/facilities",
      ),
    ).toBe(true);
    expect(
      (domainPattern as RegExp).test(
        "https://www.illinispots.com/api/facilities",
      ),
    ).toBe(true);
    expect(
      (domainPattern as RegExp).test("https://otherdomain.com/api/facilities"),
    ).toBe(false);
  });
});
