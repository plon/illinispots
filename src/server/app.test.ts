import { describe, expect, it } from "bun:test";
import { createApp } from "./app";

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

  it("sets secure headers with cross-origin referrer policy", async () => {
    const response = await createApp().request("/api/health");

    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
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

  it("redirects raw fly.dev production domain to illinispots.com", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const app = createApp();
      const response = await app.request(
        "http://illinispots.fly.dev/map?building=ECEB",
      );

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://illinispots.com/map?building=ECEB",
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
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

  it("serves HTML with injected runtime client config and no-cache header on root and SPA routes", async () => {
    const rawIndexHtml = "<!doctype html><html><head><title>Test App</title></head><body><div id='root'></div></body></html>";
    const app = createApp({
      rawIndexHtml,
      environment: {
        APP_ENV: "staging",
        MAPBOX_ACCESS_TOKEN: "pk.test_token_123",
        MAPBOX_STYLE_URL: "mapbox://styles/test/style",
        SENTRY_DSN: "https://test@sentry.io/456",
      },
    });

    const rootResponse = await app.request("/");
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.headers.get("cache-control")).toBe(
      "no-cache, must-revalidate",
    );
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain(
      '<script>window.__APP_CONFIG__={"appEnv":"staging","mapboxAccessToken":"pk.test_token_123","mapboxStyleUrl":"mapbox://styles/test/style","sentryDsn":"https://test@sentry.io/456"};</script>',
    );

    const spaResponse = await app.request("/grainger?tab=schedule");
    expect(spaResponse.status).toBe(200);
    expect(spaResponse.headers.get("cache-control")).toBe(
      "no-cache, must-revalidate",
    );
    const spaHtml = await spaResponse.text();
    expect(spaHtml).toContain(
      '<script>window.__APP_CONFIG__={"appEnv":"staging","mapboxAccessToken":"pk.test_token_123","mapboxStyleUrl":"mapbox://styles/test/style","sentryDsn":"https://test@sentry.io/456"};</script>',
    );
  });
});
