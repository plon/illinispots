import type { Hono, MiddlewareHandler } from "hono";
import { getServerConfig } from "./config";

type SentrySdk = typeof import("@sentry/hono/bun");
type SentrySpan = NonNullable<ReturnType<SentrySdk["getActiveSpan"]>>;
interface AppSpan {
  addEvent(...args: Parameters<SentrySpan["addEvent"]>): AppSpan;
  setAttribute(...args: Parameters<SentrySpan["setAttribute"]>): AppSpan;
  setAttributes(...args: Parameters<SentrySpan["setAttributes"]>): AppSpan;
}
type StartSpanOptions = Parameters<SentrySdk["startSpan"]>[0];
type CaptureExceptionHint = Parameters<SentrySdk["captureException"]>[1];
type CaptureMessageContext = Parameters<SentrySdk["captureMessage"]>[1];
type SetTagValue = Parameters<SentrySdk["setTag"]>[1];
type MetricCountOptions = Parameters<SentrySdk["metrics"]["count"]>[2];

const TRACED_API_PATHS = new Set([
  "/api/facilities",
  "/api/room-schedule",
]);
const initialConfig = getServerConfig();
const sentrySdk: SentrySdk | undefined = initialConfig.sentryDsn
  ? await import("@sentry/hono/bun")
  : undefined;

const NOOP_SPAN: AppSpan = {
  setAttribute: () => NOOP_SPAN,
  setAttributes: () => NOOP_SPAN,
  addEvent: () => NOOP_SPAN,
};

/**
 * Small facade which keeps the SDK out of the no-DSN startup path while
 * preserving the subset of Sentry used by server routes and services.
 */
export const Sentry = {
  startSpan<T>(
    options: StartSpanOptions,
    callback: (span: AppSpan) => T,
  ): T {
    return sentrySdk
      ? sentrySdk.startSpan(options, callback)
      : callback(NOOP_SPAN);
  },

  captureException(
    exception: unknown,
    hint?: CaptureExceptionHint,
  ): string {
    return sentrySdk?.captureException(exception, hint) ?? "";
  },

  captureMessage(
    message: string,
    captureContext?: CaptureMessageContext,
  ): string {
    return sentrySdk?.captureMessage(message, captureContext) ?? "";
  },

  getActiveSpan(): AppSpan | undefined {
    return sentrySdk?.getActiveSpan();
  },

  setTag(key: string, value: SetTagValue): void {
    sentrySdk?.setTag(key, value);
  },

  metrics: {
    count(
      name: string,
      value?: number,
      options?: MetricCountOptions,
    ): void {
      sentrySdk?.metrics.count(name, value, options);
    },
  },
};

export function shouldTraceServerPath(pathname: string): boolean {
  return TRACED_API_PATHS.has(pathname);
}

function requestPathname(url: string | undefined): string {
  if (!url) return "";

  try {
    return new URL(url, "http://sentry.local").pathname;
  } catch {
    return "";
  }
}

export function sentryTracing(app: Hono): MiddlewareHandler {
  const config = getServerConfig();
  if (!config.sentryDsn || !sentrySdk) {
    return (_context, next) => next();
  }

  return sentrySdk.sentry(app, {
    dsn: config.sentryDsn,
    environment: config.environment,
    tracesSampler: ({ normalizedRequest, inheritOrSampleWith }) =>
      shouldTraceServerPath(requestPathname(normalizedRequest?.url))
        ? inheritOrSampleWith(1)
        : 0,
    sendDefaultPii: false,
  });
}

export function sentryRequestContext(): MiddlewareHandler {
  if (!getServerConfig().sentryDsn || !sentrySdk) {
    return (_context, next) => next();
  }

  return async (context, next) => {
    const span = sentrySdk.getActiveSpan();
    const reqId = context.get("requestId");
    if (span && reqId && typeof reqId === "string") {
      span.setAttribute("http.request_id", reqId);
      sentrySdk.setTag("request_id", reqId);
    }

    await next();
  };
}
