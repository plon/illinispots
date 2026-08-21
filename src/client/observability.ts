import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";

type ClientEnvironmentVariables = {
  readonly MODE: string;
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_VERCEL_TARGET_ENV?: string;
};

export function resolveClientSentryEnvironment(
  environment: ClientEnvironmentVariables = import.meta.env,
): string {
  return (
    environment.VITE_VERCEL_TARGET_ENV ||
    environment.VITE_VERCEL_ENV ||
    environment.MODE
  );
}

export function initializeClientObservability(router: AnyRouter): void {
  if (Sentry.isInitialized()) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: resolveClientSentryEnvironment(),
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1,
    sendDefaultPii: false,
  });
}

export { Sentry };
