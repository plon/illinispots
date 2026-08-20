import type { ClientConfig } from "../types";

const DEFAULT_SENTRY_DSN =
  "https://b346a7b285d735686ab9ea2fd7f51413@o4511882586292224.ingest.us.sentry.io/4511882595401729";

export interface SupabaseConfig {
  url: string;
  key: string;
}

export class ServerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigurationError";
  }
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new ServerConfigurationError(
      "Missing Supabase environment variables: SUPABASE_URL and/or SUPABASE_KEY",
    );
  }

  return { url, key };
}

export function getClientConfig(): ClientConfig {
  const accessToken =
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.VITE_MAPBOX_ACCESS_TOKEN;
  const styleUrl =
    process.env.MAPBOX_STYLE_URL ?? process.env.VITE_MAPBOX_STYLE_URL;

  if (!accessToken || !styleUrl) {
    throw new ServerConfigurationError(
      "Missing Mapbox environment variables: MAPBOX_ACCESS_TOKEN and/or MAPBOX_STYLE_URL",
    );
  }

  return {
    mapbox: {
      accessToken,
      styleUrl,
    },
  };
}

export function getServerConfig() {
  const parsedPort = Number.parseInt(process.env.PORT ?? "3000", 10);

  return {
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    port: Number.isFinite(parsedPort) ? parsedPort : 3000,
    sentryDsn: process.env.SENTRY_DSN ?? DEFAULT_SENTRY_DSN,
  };
}
