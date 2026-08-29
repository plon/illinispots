import React from "react";
import { getClientConfig } from "@/client/config";
import { Sentry } from "@/client/observability";

type AnalyticsProperties = Record<string, unknown>;
type Capture = (
  eventName: string,
  properties?: AnalyticsProperties,
) => void;
type QueuedCapture = Parameters<Capture>;

export interface AnalyticsClient {
  capture: Capture;
}

export interface BufferedAnalyticsClient {
  client: AnalyticsClient;
  connect: (capture: Capture) => void;
  disable: () => void;
}

const MAX_QUEUED_CAPTURES = 100;
const disabledClient: AnalyticsClient = { capture: () => undefined };
const AnalyticsContext = React.createContext<AnalyticsClient>(disabledClient);

export function createBufferedAnalyticsClient(): BufferedAnalyticsClient {
  let destination: Capture | undefined;
  let queuedCaptures: QueuedCapture[] = [];
  let disabled = false;

  return {
    client: {
      capture: (...capture) => {
        if (destination) {
          destination(...capture);
        } else if (queuedCaptures.length < MAX_QUEUED_CAPTURES) {
          queuedCaptures.push(capture);
        }
      },
    },
    connect: (capture) => {
      if (disabled) return;
      destination = capture;
      const pendingCaptures = queuedCaptures;
      queuedCaptures = [];
      pendingCaptures.forEach((pendingCapture) => capture(...pendingCapture));
    },
    disable: () => {
      disabled = true;
      destination = disabledClient.capture;
      queuedCaptures = [];
    },
  };
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [analytics] = React.useState(createBufferedAnalyticsClient);

  React.useEffect(() => {
    const { posthogProjectToken, posthogHost } = getClientConfig();
    if (!posthogProjectToken || !posthogHost) {
      analytics.disable();
      return;
    }

    let cancelled = false;

    void import("posthog-js")
      .then(({ default: posthog }) => {
        if (cancelled) return;

        const client = posthog.init(posthogProjectToken, {
          api_host: posthogHost,
          defaults: "2026-01-30",
          debug: import.meta.env.DEV,
        });
        analytics.connect(client.capture.bind(client));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        analytics.disable();
        Sentry.captureException(error);
      });

    return () => {
      cancelled = true;
    };
  }, [analytics]);

  return (
    <AnalyticsContext.Provider value={analytics.client}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function usePostHog(): AnalyticsClient {
  return React.useContext(AnalyticsContext);
}
