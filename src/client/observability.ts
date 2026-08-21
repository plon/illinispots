import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";

export function initializeClientObservability(router: AnyRouter): void {
  if (Sentry.isInitialized()) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1,
    sendDefaultPii: false,
  });
}

export { Sentry };
