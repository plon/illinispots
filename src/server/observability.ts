import * as Sentry from "@sentry/hono/bun";
import type { Hono, MiddlewareHandler } from "hono";
import { getServerConfig } from "./config";

const TRACED_API_PATHS = new Set([
  "/api/facilities",
  "/api/room-schedule",
]);

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
  if (!config.sentryDsn) {
    return async (_context, next) => await next();
  }

  return Sentry.sentry(app, {
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
  return async (context, next) => {
    const span = Sentry.getActiveSpan();
    const reqId = context.get("requestId");
    if (span && reqId && typeof reqId === "string") {
      span.setAttribute("http.request_id", reqId);
      Sentry.setTag("request_id", reqId);
    }

    await next();
  };
}

export { Sentry };
