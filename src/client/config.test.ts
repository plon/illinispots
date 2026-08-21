import { describe, expect, it } from "bun:test";
import { getClientConfig } from "./config";

describe("getClientConfig", () => {
  it("prefers runtime window.__APP_CONFIG__ values when available", () => {
    const windowMock = {
      __APP_CONFIG__: {
        appEnv: "staging",
        mapboxAccessToken: "pk.runtime_token",
        mapboxStyleUrl: "mapbox://styles/runtime_style",
        sentryDsn: "https://runtime@sentry.io/1",
      },
    };

    const fallbackEnv = {
      VITE_APP_ENV: "production",
      VITE_MAPBOX_ACCESS_TOKEN: "pk.fallback_token",
      VITE_MAPBOX_STYLE_URL: "mapbox://styles/fallback_style",
      VITE_SENTRY_DSN: "https://fallback@sentry.io/1",
      MODE: "production",
    };

    expect(getClientConfig(fallbackEnv, windowMock)).toEqual({
      appEnv: "staging",
      mapboxAccessToken: "pk.runtime_token",
      mapboxStyleUrl: "mapbox://styles/runtime_style",
      sentryDsn: "https://runtime@sentry.io/1",
    });
  });

  it("falls back to import.meta.env when window.__APP_CONFIG__ is empty or not defined", () => {
    const fallbackEnv = {
      VITE_APP_ENV: "staging",
      VITE_MAPBOX_ACCESS_TOKEN: "pk.fallback_token",
      VITE_MAPBOX_STYLE_URL: "mapbox://styles/fallback_style",
      VITE_SENTRY_DSN: "https://fallback@sentry.io/1",
      MODE: "production",
    };

    expect(getClientConfig(fallbackEnv, undefined)).toEqual({
      appEnv: "staging",
      mapboxAccessToken: "pk.fallback_token",
      mapboxStyleUrl: "mapbox://styles/fallback_style",
      sentryDsn: "https://fallback@sentry.io/1",
    });
  });

  it("defaults appEnv to MODE or development when no APP_ENV is configured", () => {
    expect(getClientConfig({ MODE: "development" }, undefined)).toEqual({
      appEnv: "development",
      mapboxAccessToken: "",
      mapboxStyleUrl: "",
      sentryDsn: "",
    });

    expect(getClientConfig({}, undefined)).toEqual({
      appEnv: "development",
      mapboxAccessToken: "",
      mapboxStyleUrl: "",
      sentryDsn: "",
    });
  });
});
