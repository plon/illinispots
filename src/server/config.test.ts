import { describe, expect, it } from "bun:test";
import { resolveSentryEnvironment } from "./config";

describe("resolveSentryEnvironment", () => {
  it("uses the Vercel target so custom environments retain their name", () => {
    expect(
      resolveSentryEnvironment({
        VERCEL_TARGET_ENV: "staging",
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("allows an explicit Sentry environment to override the platform", () => {
    expect(
      resolveSentryEnvironment({
        SENTRY_ENVIRONMENT: "testing",
        VERCEL_TARGET_ENV: "preview",
      }),
    ).toBe("testing");
  });

  it("falls back through the standard Vercel and runtime environments", () => {
    expect(resolveSentryEnvironment({ VERCEL_ENV: "preview" })).toBe(
      "preview",
    );
    expect(resolveSentryEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(resolveSentryEnvironment({})).toBe("development");
  });
});
