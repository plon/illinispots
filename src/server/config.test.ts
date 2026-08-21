import { describe, expect, it } from "bun:test";
import { getServerConfig, resolveSentryEnvironment } from "./config";

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

describe("getServerConfig", () => {
  it("enables server telemetry only when a DSN is configured", () => {
    expect(
      getServerConfig({
        PORT: "4000",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        VERCEL_TARGET_ENV: "preview",
      }),
    ).toEqual({
      environment: "preview",
      port: 4000,
      sentryDsn: "https://public@example.ingest.sentry.io/1",
    });

    expect(getServerConfig({})).toEqual({
      environment: "development",
      port: 3000,
      sentryDsn: undefined,
    });
  });
});
