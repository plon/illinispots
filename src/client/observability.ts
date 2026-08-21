import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";

type ClientEnvironmentVariables = {
  readonly MODE: string;
  readonly VITE_APP_ENV?: string;
};

export function resolveClientAppEnvironment(
  environment: ClientEnvironmentVariables = import.meta.env,
): string {
  return environment.VITE_APP_ENV || environment.MODE || "development";
}

export const resolveClientSentryEnvironment = resolveClientAppEnvironment;

export const CLIENT_TRACE_PROPAGATION_TARGETS = [
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/:?#]|$)/,
  /^\//,
  /^https:\/\/(?:(?:www|staging)\.)?illinispots\.com(?:[/:?#]|$)/,
  /^https:\/\/(?:[a-zA-Z0-9-]+\.)*fly\.dev(?:[/:?#]|$)/,
];

export function initializeClientObservability(router: AnyRouter): void {
  if (Sentry.isInitialized()) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: resolveClientSentryEnvironment(),
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1,
    tracePropagationTargets: CLIENT_TRACE_PROPAGATION_TARGETS,
    sendDefaultPii: false,
  });
}

export { Sentry };
