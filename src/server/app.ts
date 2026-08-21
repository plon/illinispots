import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import type { ClientConfig } from "../types";
import { getClientConfig, ServerConfigurationError } from "./config";
import {
  createFacilitiesRoutes,
  type FacilitiesRouteDependencies,
} from "./routes/facilities";
import {
  createRoomScheduleRoutes,
  type RoomScheduleRouteDependencies,
} from "./routes/room-schedule";
import { Sentry, sentryTracing } from "./observability";

export interface AppDependencies {
  clientConfig?: ClientConfig;
  facilities?: FacilitiesRouteDependencies;
  roomSchedule?: RoomScheduleRouteDependencies;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  app.use("*", requestId());
  app.use("*", sentryTracing());
  app.use("*", secureHeaders());

  if (!isTest) {
    app.use("*", logger());
  }

  app.use("*", async (context, next) => {
    if (
      isProduction &&
      new URL(context.req.url).hostname === "www.illinispots.com"
    ) {
      const canonicalUrl = new URL(context.req.url);
      canonicalUrl.protocol = "https:";
      canonicalUrl.hostname = "illinispots.com";
      return context.redirect(canonicalUrl.toString(), 308);
    }

    await next();
  });

  app.get("/api/health", (context) =>
    context.json({
      status: "ok",
      runtime: "bun",
      runtimeVersion: process.versions.bun,
    }),
  );
  app.get("/api/config", (context) => {
    try {
      return context.json(dependencies.clientConfig ?? getClientConfig());
    } catch (error) {
      if (error instanceof ServerConfigurationError) {
        Sentry.captureException(error, {
          tags: { component: "server", route: context.req.path },
        });
        return context.json({ error: "Client configuration unavailable" }, 500);
      }

      throw error;
    }
  });
  app.route("/api/facilities", createFacilitiesRoutes(dependencies.facilities));
  app.route(
    "/api/room-schedule",
    createRoomScheduleRoutes(dependencies.roomSchedule),
  );

  app.all("/api/*", (context) =>
    context.json({ error: "API route not found" }, 404),
  );

  if (isProduction) {
    app.use(
      "*",
      serveStatic({
        root: "./dist/client",
        precompressed: true,
        onFound: (path, context) => {
          if (path.includes("/assets/")) {
            context.header(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
          }
        },
      }),
    );
    app.get("*", serveStatic({ path: "./dist/client/index.html" }));
  }

  app.notFound((context) =>
    context.json(
      {
        error:
          isProduction
            ? "Application asset not found"
            : "Route not found. The Vite client runs on http://localhost:5173 in development.",
      },
      404,
    ),
  );

  app.onError((error, context) => {
    Sentry.captureException(error, {
      tags: { component: "server", route: context.req.path },
    });
    console.error("Unhandled server error:", error);
    return context.json({ error: "Internal server error" }, 500);
  });

  return app;
}
