import { describe, expect, it } from "bun:test";
import { createApp } from "./app";
import { Sentry } from "./observability";

describe("server application", () => {
  it("reports runtime health", async () => {
    const response = await createApp().request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      runtime: "bun",
      runtimeVersion: process.versions.bun,
    });
  });

  it("keeps unknown API routes as JSON 404s", async () => {
    const response = await createApp().request("/api/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "API route not found" });
  });

  it("redirects the www host to the canonical HTTPS origin in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const app = createApp();
      const response = await app.request("http://www.illinispots.com/path?x=1");

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://illinispots.com/path?x=1",
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("redirects raw fly.dev staging domain to staging.illinispots.com", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAppEnv = process.env.APP_ENV;
    try {
      process.env.NODE_ENV = "production";
      process.env.APP_ENV = "staging";
      const app = createApp();
      const response = await app.request(
        "http://illinispots-staging.fly.dev/path?tab=schedule",
      );

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://staging.illinispots.com/path?tab=schedule",
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.APP_ENV = previousAppEnv;
    }
  });

  it("adds noindex header to responses on staging and fly.dev domains", async () => {
    const app = createApp();

    const stagingDomainResponse = await app.request(
      "https://staging.illinispots.com/api/health",
    );
    expect(stagingDomainResponse.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );

    const flyResponse = await app.request(
      "https://illinispots-staging.fly.dev/api/health",
    );
    expect(flyResponse.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );

    const prodResponse = await app.request(
      "https://illinispots.com/api/health",
    );
    expect(prodResponse.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("serves disallow robots.txt on staging and allow on production", async () => {
    const app = createApp();

    const stagingRobots = await app.request(
      "https://staging.illinispots.com/robots.txt",
    );
    expect(stagingRobots.status).toBe(200);
    expect(await stagingRobots.text()).toBe("User-agent: *\nDisallow: /\n");

    const prodRobots = await app.request("https://illinispots.com/robots.txt");
    expect(prodRobots.status).toBe(200);
    expect(await prodRobots.text()).toBe("User-agent: *\nAllow: /\n");
  });

  it("propagates incoming distributed tracing headers into server spans", async () => {
    if (!Sentry.isInitialized()) {
      Sentry.init({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        tracesSampleRate: 1,
      });
    }

    let capturedTraceId: string | undefined;
    let capturedParentSpanId: string | undefined;
    let capturedSpanName: string | undefined;

    const testApp = createApp({
      facilities: {
        getFacilityStatus: async () => {
          const activeSpan = Sentry.getActiveSpan();
          if (activeSpan) {
            const spanJson = Sentry.spanToJSON(activeSpan);
            capturedTraceId = spanJson.trace_id;
            capturedParentSpanId = spanJson.parent_span_id;
            capturedSpanName = spanJson.description;
          }
          return { timestamp: "2026-08-21T14:00:00Z", facilities: {} };
        },
      },
    });

    const sentryTrace = "4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-1";
    const response = await testApp.request("/api/facilities", {
      headers: {
        "sentry-trace": sentryTrace,
        baggage: "sentry-environment=production",
      },
    });

    expect(response.status).toBe(200);
    expect(capturedTraceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(capturedParentSpanId).toBe("00f067aa0ba902b7");
    expect(capturedSpanName).toBe("GET /api/facilities");
  });

  it("skips span creation for static assets under /assets/", async () => {
    if (!Sentry.isInitialized()) {
      Sentry.init({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        tracesSampleRate: 1,
      });
    }

    let activeSpanInsideHandler: unknown = "unreached";
    const customApp = createApp();
    customApp.get("/assets/custom-asset.js", (context) => {
      activeSpanInsideHandler = Sentry.getActiveSpan();
      return context.text("asset");
    });

    const response = await customApp.request("/assets/custom-asset.js");
    expect(response.status).toBe(200);
    expect(activeSpanInsideHandler).toBeUndefined();
  });

  it("records HTTP status on server span when a route throws", async () => {
    if (!Sentry.isInitialized()) {
      Sentry.init({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        tracesSampleRate: 1,
      });
    }

    let activeSpanJson: ReturnType<typeof Sentry.spanToJSON> | undefined;
    const testApp = createApp({
      facilities: {
        getFacilityStatus: async () => {
          const activeSpan = Sentry.getActiveSpan();
          if (activeSpan) {
            activeSpanJson = Sentry.spanToJSON(activeSpan);
          }
          throw new Error("Simulated facility failure");
        },
      },
    });

    const response = await testApp.request("/api/facilities");
    expect(response.status).toBe(500);
    expect(activeSpanJson).toBeDefined();
    expect(activeSpanJson?.op).toBe("http.server");
  });

  it("isolates request scope tags across concurrent requests", async () => {
    if (!Sentry.isInitialized()) {
      Sentry.init({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        tracesSampleRate: 1,
      });
    }

    let tagAlpha: string | undefined;
    let tagBeta: string | undefined;

    const testApp = createApp({
      facilities: {
        getFacilityStatus: async (_target, scope) => {
          if (scope === "academic") {
            await new Promise((resolve) => setTimeout(resolve, 20));
            tagAlpha = Sentry.getIsolationScope().getScopeData().tags
              .request_id as string;
          } else {
            tagBeta = Sentry.getIsolationScope().getScopeData().tags
              .request_id as string;
          }
          return { timestamp: "2026-08-21T14:00:00Z", facilities: {} };
        },
      },
    });

    const [resAlpha, resBeta] = await Promise.all([
      testApp.request("/api/facilities?type=academic", {
        headers: { "x-request-id": "req-alpha" },
      }),
      testApp.request("/api/facilities?type=library", {
        headers: { "x-request-id": "req-beta" },
      }),
    ]);

    expect(resAlpha.status).toBe(200);
    expect(resBeta.status).toBe(200);
    expect(tagAlpha).toBe("req-alpha");
    expect(tagBeta).toBe("req-beta");
  });
});
