import type { AnyRouter } from "@tanstack/react-router";
import { getClientConfig } from "./config";

type SentryClientModule = typeof import("./sentry-client");
type CaptureContext = {
  tags?: Record<string, string>;
};

let sentryModulePromise: Promise<SentryClientModule> | undefined;
let observabilityEnabled = false;

function loadSentry(): Promise<SentryClientModule> {
  sentryModulePromise ??= import("./sentry-client");
  return sentryModulePromise;
}

function withSentry(callback: (sentry: SentryClientModule) => void): void {
  if (!observabilityEnabled) return;

  void loadSentry().then(callback).catch((error: unknown) => {
    console.warn("Client observability failed:", error);
  });
}

export const CLIENT_TRACE_PROPAGATION_TARGETS = [
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/:?#]|$)/,
  /^\/(?!\/)/,
  /^https:\/\/(?:(?:www|staging)\.)?illinispots\.com(?:[/:?#]|$)/,
  /^https:\/\/illinispots(?:-staging)?\.fly\.dev(?:[/:?#]|$)/,
];

export function initializeClientObservability(router: AnyRouter): void {
  const config = getClientConfig();
  if (!config.sentryDsn) return;

  observabilityEnabled = true;
  withSentry((sentry) => {
    sentry.initializeSentryClient(router, config.sentryDsn, config.appEnv);
  });
}

export function captureClientException(
  error: unknown,
  context?: CaptureContext,
): void {
  withSentry((sentry) => {
    sentry.captureSentryException(error, context);
  });
}

export function recordClientDistribution(
  name: string,
  value: number,
  attributes: Record<string, string | boolean>,
): void {
  withSentry((sentry) => {
    sentry.recordSentryDistribution(name, value, attributes);
  });
}

export function recordClientCount(
  name: string,
  value: number,
  attributes: Record<string, string | boolean>,
): void {
  withSentry((sentry) => {
    sentry.recordSentryCount(name, value, attributes);
  });
}
