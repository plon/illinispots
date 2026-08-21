import * as Sentry from "@sentry/bun";
import type { MiddlewareHandler } from "hono";
import { getServerConfig } from "./config";

const config = getServerConfig();

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    tracesSampleRate: 1,
    sendDefaultPii: false,
  });
}

export function sentryTracing(): MiddlewareHandler {
  return async (context, next) => {
    if (context.req.path.startsWith("/assets/")) {
      return await next();
    }

    const sentryTrace = context.req.header("sentry-trace");
    const baggage = context.req.header("baggage");

    return Sentry.withIsolationScope(() => {
      return Sentry.continueTrace({ sentryTrace, baggage }, () => {
        return Sentry.startSpan(
          {
            name: `${context.req.method} ${context.req.path}`,
            op: "http.server",
            attributes: {
              "http.method": context.req.method,
              "http.url": context.req.url,
              "http.route": context.req.path,
            },
          },
          async (span) => {
            const reqId = context.get("requestId");
            if (reqId && typeof reqId === "string") {
              span?.setAttribute("http.request_id", reqId);
              Sentry.setTag("request_id", reqId);
            }

            try {
              await next();
            } catch (error) {
              if (span) {
                Sentry.setHttpStatus(span, 500);
              }
              throw error;
            } finally {
              if (span && context.finalized) {
                Sentry.setHttpStatus(span, context.res.status);
              }
            }
          },
        );
      });
    });
  };
}

export { Sentry };
