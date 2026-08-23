import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { compress } from "hono/compress";
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
import { sentryRequestContext, sentryTracing } from "./observability";
import { getPublicClientConfig } from "./config";
import { injectClientConfig, loadIndexHtml } from "./html";

export interface AppDependencies {
  facilities?: FacilitiesRouteDependencies;
  roomSchedule?: RoomScheduleRouteDependencies;
  indexHtmlPath?: string;
  rawIndexHtml?: string;
  environment?: Record<string, string | undefined>;
}

function requestHostname(context: Context): string {
  const hostHeader =
    context.req.header("x-forwarded-host") || context.req.header("host");

  if (!hostHeader) {
    return new URL(context.req.url).hostname;
  }

  const normalizedHost = hostHeader.toLowerCase();

  if (normalizedHost.startsWith("[")) {
    const closingBracket = normalizedHost.indexOf("]");
    return closingBracket === -1
      ? normalizedHost
      : normalizedHost.slice(1, closingBracket);
  }

  const portSeparator = normalizedHost.indexOf(":");
  return portSeparator === -1
    ? normalizedHost
    : normalizedHost.slice(0, portSeparator);
}

export function publicAssetCacheControl(path: string): string | undefined {
  if (path.endsWith("/manifest.json") || path === "manifest.json") {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }

  if (/(?:^|\/)(?:apple-touch-icon|icon-\d+)\.png$/.test(path)) {
    return "public, max-age=604800, stale-while-revalidate=2592000";
  }

  return undefined;
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;

  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value === etag || value === `W/${etag}`;
  });
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";
  const appEnv = process.env.APP_ENV;
  app.use(sentryTracing(app));
  app.use("*", requestId());
  app.use("*", sentryRequestContext());
  app.use(
    "*",
    secureHeaders({
      referrerPolicy: "strict-origin-when-cross-origin",
    }),
  );

  if (!isTest) {
    app.use("*", logger());
  }

  // These two endpoints return the application's largest dynamic payloads.
  // Compression is response-negotiated and leaves clients without gzip support
  // untouched.
  app.use("/api/facilities", compress({ encoding: "gzip" }));
  app.use("/api/room-schedule", compress({ encoding: "gzip" }));

  app.use("*", async (context, next) => {
    const hostname = requestHostname(context);

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
        hostname === "illinispots.fly.dev"
      ) {
        const canonicalUrl = new URL(context.req.url);
        canonicalUrl.protocol = "https:";
        canonicalUrl.hostname = "illinispots.com";
        return context.redirect(canonicalUrl.toString(), 308);
      }
    }
    await next();

    if (
      appEnv === "staging" ||
      hostname.startsWith("staging.") ||
      hostname.endsWith(".fly.dev")
    ) {
      context.header("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
  });

  app.get("/robots.txt", (context) => {
    const hostname = requestHostname(context);
    const isStaging =
      appEnv === "staging" ||
      hostname.startsWith("staging.") ||
      hostname.endsWith(".fly.dev");

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
    const injectedHtmlEtag = injectedHtml
      ? `"${createHash("sha256").update(injectedHtml).digest("base64url")}"`
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
        const path = context.req.path;
        if (
          path === "/" ||
          path === "/index.html" ||
          !path.slice(1).includes(".")
        ) {
          context.header("Cache-Control", "no-cache, must-revalidate");
          context.header("ETag", injectedHtmlEtag);
          if (
            etagMatches(
              context.req.header("if-none-match"),
              injectedHtmlEtag,
            )
          ) {
            return context.body(null, 304);
          }
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
        onFound: (path, context) => {
          const cacheControl = publicAssetCacheControl(path);
          if (cacheControl) {
            context.header("Cache-Control", cacheControl);
          }
        },
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
    console.error("Unhandled server error:", error);
    return context.json({ error: "Internal server error" }, 500);
  });

  return app;
}
