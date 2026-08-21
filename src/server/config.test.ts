import { describe, expect, it } from "bun:test";
import {
  getServerConfig,
  getSupabaseConfig,
  resolveAppEnvironment,
  ServerConfigurationError,
} from "./config";

describe("resolveAppEnvironment", () => {
  it("prefers explicit APP_ENV", () => {
    expect(
      resolveAppEnvironment({
        APP_ENV: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("infers environment from FLY_APP_NAME", () => {
    expect(
      resolveAppEnvironment({
        FLY_APP_NAME: "illinispots-staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");

    expect(
      resolveAppEnvironment({
        FLY_APP_NAME: "illinispots",
        NODE_ENV: "production",
      }),
    ).toBe("production");
  });

  it("falls back to NODE_ENV or development", () => {
    expect(resolveAppEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(resolveAppEnvironment({})).toBe("development");
  });
});

describe("getServerConfig", () => {
  it("enables server telemetry only when a DSN is configured", () => {
    expect(
      getServerConfig({
        PORT: "4000",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        APP_ENV: "staging",
      }),
    ).toEqual({
      environment: "staging",
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

describe("getSupabaseConfig", () => {
  it("returns configured URL and publishable key", () => {
    expect(
      getSupabaseConfig({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "pub_key_123",
      }),
    ).toEqual({
      url: "https://test.supabase.co",
      key: "pub_key_123",
    });
  });
  it("throws ServerConfigurationError when URL or key are missing", () => {
    expect(() => getSupabaseConfig({})).toThrow(ServerConfigurationError);
    expect(() =>
      getSupabaseConfig({ SUPABASE_URL: "https://test.supabase.co" }),
    ).toThrow(ServerConfigurationError);
    expect(() =>
      getSupabaseConfig({ SUPABASE_PUBLISHABLE_KEY: "pub_key_123" }),
    ).toThrow(ServerConfigurationError);
  });
});
