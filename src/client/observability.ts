import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";
import { getClientConfig, type FallbackClientEnvironment } from "./config";

export function resolveClientAppEnvironment(
  environment: FallbackClientEnvironment = import.meta.env,
  windowRef?: { __APP_CONFIG__?: { appEnv?: string } },
): string {
  return getClientConfig(environment, windowRef).appEnv;
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

  const config = getClientConfig();
  if (!config.sentryDsn) return;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1,
    tracePropagationTargets: CLIENT_TRACE_PROPAGATION_TARGETS,
    sendDefaultPii: false,
  });
}

export { Sentry };
