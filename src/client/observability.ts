import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";
import { getClientConfig } from "./config";
export const CLIENT_TRACE_PROPAGATION_TARGETS = [
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/:?#]|$)/,
  /^\/(?!\/)/,
  /^https:\/\/(?:(?:www|staging)\.)?illinispots\.com(?:[/:?#]|$)/,
  /^https:\/\/illinispots(?:-staging)?\.fly\.dev(?:[/:?#]|$)/,
];

export function shouldCreateClientRequestSpan(url: string): boolean {
  try {
    const hostname = new URL(url, "https://illinispots.local").hostname;
    return hostname !== "mapbox.com" && !hostname.endsWith(".mapbox.com");
  } catch {
    return true;
  }
}

export function initializeClientObservability(router: AnyRouter): void {
  if (Sentry.isInitialized()) return;

  const config = getClientConfig();
  if (!config.sentryDsn) return;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router, {
        shouldCreateSpanForRequest: shouldCreateClientRequestSpan,
      }),
    ],
    tracesSampleRate: 1,
    tracePropagationTargets: CLIENT_TRACE_PROPAGATION_TARGETS,
    sendDefaultPii: false,
  });
}

export { Sentry };
