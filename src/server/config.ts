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

export function getSupabaseConfig(
  environment: EnvironmentVariables = process.env,
): SupabaseConfig {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new ServerConfigurationError(
      "Missing Supabase environment variables: SUPABASE_URL and/or SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return { url, key };
}

export function resolveAppEnvironment(
  environment: EnvironmentVariables = process.env,
): string {
  if (environment.APP_ENV) {
    return environment.APP_ENV;
  }
  if (environment.FLY_APP_NAME === "illinispots-staging") {
    return "staging";
  }
  if (environment.FLY_APP_NAME === "illinispots") {
    return "production";
  }
  return environment.NODE_ENV || "development";
}

export const resolveSentryEnvironment = resolveAppEnvironment;

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

export interface PublicClientConfig {
  appEnv: string;
  mapboxAccessToken?: string;
  mapboxStyleUrl?: string;
  sentryDsn?: string;
}

export function getPublicClientConfig(
  environment: EnvironmentVariables = process.env,
): PublicClientConfig {
  return {
    appEnv: resolveAppEnvironment(environment),
    mapboxAccessToken:
      environment.MAPBOX_ACCESS_TOKEN ||
      environment.VITE_MAPBOX_ACCESS_TOKEN ||
      "",
    mapboxStyleUrl:
      environment.MAPBOX_STYLE_URL ||
      environment.VITE_MAPBOX_STYLE_URL ||
      "",
    sentryDsn:
      environment.SENTRY_DSN ||
      environment.VITE_SENTRY_DSN ||
      "",
  };
}
