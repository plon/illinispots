import type { PublicClientConfig } from "@/types";

export type { PublicClientConfig };

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<PublicClientConfig>;
  }
}

export type FallbackClientEnvironment = {
  readonly VITE_APP_ENV?: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  readonly VITE_MAPBOX_STYLE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly MODE?: string;
};

export function getClientConfig(
  fallbackEnv: FallbackClientEnvironment = import.meta.env,
  windowRef: { __APP_CONFIG__?: Partial<PublicClientConfig> } | undefined = typeof window !== "undefined"
    ? window
    : undefined,
): PublicClientConfig {
  const runtimeConfig = windowRef?.__APP_CONFIG__;

  return {
    appEnv:
      runtimeConfig?.appEnv ||
      fallbackEnv.VITE_APP_ENV ||
      fallbackEnv.MODE ||
      "development",
    mapboxAccessToken:
      runtimeConfig?.mapboxAccessToken ||
      fallbackEnv.VITE_MAPBOX_ACCESS_TOKEN ||
      "",
    mapboxStyleUrl:
      runtimeConfig?.mapboxStyleUrl ||
      fallbackEnv.VITE_MAPBOX_STYLE_URL ||
      "",
    sentryDsn:
      runtimeConfig?.sentryDsn ||
      fallbackEnv.VITE_SENTRY_DSN ||
      "",
  };
}
