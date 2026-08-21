import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";
import { getClientConfig } from "./config";
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
