import * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";

const DEFAULT_SENTRY_DSN =
  "https://b346a7b285d735686ab9ea2fd7f51413@o4511882586292224.ingest.us.sentry.io/4511882595401729";

export function initializeClientObservability(router: AnyRouter): void {
  if (Sentry.isInitialized()) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN ?? DEFAULT_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1,
    sendDefaultPii: false,
  });
}

export { Sentry };
