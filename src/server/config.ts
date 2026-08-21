import type { ClientConfig } from "../types";

export interface SupabaseConfig {
  url: string;
  key: string;
}

type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

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

export function resolveSentryEnvironment(
  environment: EnvironmentVariables = process.env,
): string {
  return (
    environment.SENTRY_ENVIRONMENT ||
    environment.VERCEL_TARGET_ENV ||
    environment.VERCEL_ENV ||
    environment.NODE_ENV ||
    "development"
  );
}

export function getServerConfig(
  environment: EnvironmentVariables = process.env,
) {
  const parsedPort = Number.parseInt(environment.PORT ?? "3000", 10);

  return {
    environment: resolveSentryEnvironment(environment),
    port: Number.isFinite(parsedPort) ? parsedPort : 3000,
    sentryDsn: environment.SENTRY_DSN,
  };
}
