import {
  captureException,
  init,
  isInitialized,
  metrics,
  tanstackRouterBrowserTracingIntegration,
} from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";
import { CLIENT_TRACE_PROPAGATION_TARGETS } from "./observability";

type CaptureContext = {
  tags?: Record<string, string>;
};

type MetricAttributes = Record<string, string | boolean>;

export function initializeSentryClient(
  router: AnyRouter,
  dsn: string,
  environment: string,
): void {
  if (isInitialized()) return;

  init({
    dsn,
    environment,
    integrations: [tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1,
    tracePropagationTargets: CLIENT_TRACE_PROPAGATION_TARGETS,
    sendDefaultPii: false,
  });
}

export function captureSentryException(
  error: unknown,
  context?: CaptureContext,
): void {
  captureException(error, context);
}

export function recordSentryDistribution(
  name: string,
  value: number,
  attributes: MetricAttributes,
): void {
  metrics.distribution(name, value, {
    unit: "millisecond",
    attributes,
  });
}

export function recordSentryCount(
  name: string,
  value: number,
  attributes: MetricAttributes,
): void {
  metrics.count(name, value, { attributes });
}
