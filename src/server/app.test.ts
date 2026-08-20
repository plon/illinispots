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
});
