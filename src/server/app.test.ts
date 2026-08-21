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

  it("serves public client configuration at runtime", async () => {
    const clientConfig = {
      mapbox: {
        accessToken: "public-token",
        styleUrl: "mapbox://styles/example/style",
      },
    };
    const response = await createApp({ clientConfig }).request("/api/config");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(clientConfig);
  });

  it("keeps unknown API routes as JSON 404s", async () => {
    const response = await createApp().request("/api/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "API route not found" });
  });

  it("redirects the www host to the canonical HTTPS origin in production", async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const app = createApp();
    process.env.NODE_ENV = previousEnvironment;

    const response = await app.request("http://www.illinispots.com/path?x=1");

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://illinispots.com/path?x=1",
    );
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
});
