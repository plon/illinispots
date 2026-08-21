import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import {
  createFacilitiesRoutes,
  type FacilitiesRouteDependencies,
} from "./routes/facilities";
import {
  createRoomScheduleRoutes,
  type RoomScheduleRouteDependencies,
} from "./routes/room-schedule";
import { Sentry, sentryTracing } from "./observability";
import { getPublicClientConfig } from "./config";
import { injectClientConfig, loadIndexHtml } from "./html";

export interface AppDependencies {
  facilities?: FacilitiesRouteDependencies;
  roomSchedule?: RoomScheduleRouteDependencies;
  indexHtmlPath?: string;
  rawIndexHtml?: string;
  environment?: Record<string, string | undefined>;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";
  const appEnv = process.env.APP_ENV;
  app.use("*", requestId());
  app.use("*", sentryTracing());
  app.use("*", secureHeaders());

  if (!isTest) {
    app.use("*", logger());
  }

  app.use("*", async (context, next) => {
    const url = new URL(context.req.url);
    const hostHeader =
      context.req.header("x-forwarded-host") ||
      context.req.header("host") ||
      url.hostname;
    const hostname = hostHeader.split(":")[0];

    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1";

    if (!isLocal) {
      if (
        appEnv === "staging" &&
        hostname === "illinispots-staging.fly.dev"
      ) {
        const canonicalUrl = new URL(context.req.url);
        canonicalUrl.protocol = "https:";
        canonicalUrl.hostname = "staging.illinispots.com";
        return context.redirect(canonicalUrl.toString(), 308);
      }

      if (
        isProduction &&
        (hostname === "www.illinispots.com" || hostname.endsWith(".vercel.app"))
      ) {
        const canonicalUrl = new URL(context.req.url);
        canonicalUrl.protocol = "https:";
        canonicalUrl.hostname = "illinispots.com";
        return context.redirect(canonicalUrl.toString(), 308);
      }
    }
    await next();

    if (
      process.env.APP_ENV === "staging" ||
      url.hostname.startsWith("staging.") ||
      url.hostname.endsWith(".fly.dev")
    ) {
      context.header("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
  });

  app.get("/robots.txt", (context) => {
    const url = new URL(context.req.url);
    const isStaging =
      process.env.APP_ENV === "staging" ||
      url.hostname.startsWith("staging.") ||
      url.hostname.endsWith(".fly.dev");

    const body = isStaging
      ? "User-agent: *\nDisallow: /\n"
      : "User-agent: *\nAllow: /\n";

    context.header("Content-Type", "text/plain; charset=utf-8");
    return context.text(body);
  });

  app.get("/api/health", (context) =>
    context.json({
      status: "ok",
      runtime: "bun",
      runtimeVersion: process.versions.bun,
    }),
  );
  app.route("/api/facilities", createFacilitiesRoutes(dependencies.facilities));
  app.route(
    "/api/room-schedule",
    createRoomScheduleRoutes(dependencies.roomSchedule),
  );

  app.all("/api/*", (context) =>
    context.json({ error: "API route not found" }, 404),
  );

  if (isProduction || dependencies.rawIndexHtml) {
    const rawHtml =
      dependencies.rawIndexHtml ??
      loadIndexHtml(dependencies.indexHtmlPath ?? "./dist/client/index.html");
    const clientConfig = getPublicClientConfig(
      dependencies.environment ?? process.env,
    );
    const injectedHtml = rawHtml
      ? injectClientConfig(rawHtml, clientConfig)
      : "";

    app.use(
      "/assets/*",
      serveStatic({
        root: "./dist/client",
        precompressed: true,
        onFound: (_path, context) => {
          context.header(
            "Cache-Control",
            "public, max-age=31536000, immutable",
          );
        },
      }),
    );

    if (injectedHtml) {
      app.get("*", (context, next) => {
        const path = new URL(context.req.url).pathname;
        if (
          path === "/" ||
          path === "/index.html" ||
          !path.slice(1).includes(".")
        ) {
          context.header("Cache-Control", "no-cache, must-revalidate");
          return context.html(injectedHtml);
        }
        return next();
      });
    }

    app.use(
      "*",
      serveStatic({
        root: "./dist/client",
        precompressed: true,
      }),
    );
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
