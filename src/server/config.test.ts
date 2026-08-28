import { describe, expect, it } from "bun:test";
import {
  getPublicClientConfig,
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

describe("getPublicClientConfig", () => {
  it("resolves public client config from standard or VITE_ prefixed environment variables", () => {
    expect(
      getPublicClientConfig({
        APP_ENV: "staging",
        MAPBOX_ACCESS_TOKEN: "pk.standard_token",
        MAPBOX_STYLE_URL: "mapbox://styles/standard",
        SENTRY_DSN: "https://standard@sentry.io/1",
      }),
    ).toEqual({
      appEnv: "staging",
      mapboxAccessToken: "pk.standard_token",
      mapboxStyleUrl: "mapbox://styles/standard",
      sentryDsn: "https://standard@sentry.io/1",
    });

    expect(
      getPublicClientConfig({
        VITE_MAPBOX_ACCESS_TOKEN: "pk.vite_token",
        VITE_MAPBOX_STYLE_URL: "mapbox://styles/vite",
        VITE_SENTRY_DSN: "https://vite@sentry.io/2",
      }),
    ).toEqual({
      appEnv: "development",
      mapboxAccessToken: "pk.vite_token",
      mapboxStyleUrl: "mapbox://styles/vite",
      sentryDsn: "https://vite@sentry.io/2",
    });

    expect(
      getPublicClientConfig({
        VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test_token",
        VITE_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      }),
    ).toEqual({
      appEnv: "development",
      mapboxAccessToken: "",
      mapboxStyleUrl: "",
      sentryDsn: "",
      posthogProjectToken: "phc_test_token",
      posthogHost: "https://us.i.posthog.com",
    });
  });
});
