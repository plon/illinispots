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
