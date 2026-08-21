import { describe, expect, it } from "bun:test";
import { injectClientConfig } from "./html";

describe("injectClientConfig", () => {
  it("injects window.__APP_CONFIG__ script right after opening head tag", () => {
    const rawHtml = "<!doctype html><html><head><title>Test</title></head><body></body></html>";
    const config = {
      appEnv: "staging",
      mapboxAccessToken: "pk.test_token",
      mapboxStyleUrl: "mapbox://styles/test_style",
      sentryDsn: "https://test@sentry.io/1",
    };

    const injected = injectClientConfig(rawHtml, config);
    expect(injected).toBe(
      '<!doctype html><html><head><script>window.__APP_CONFIG__={"appEnv":"staging","mapboxAccessToken":"pk.test_token","mapboxStyleUrl":"mapbox://styles/test_style","sentryDsn":"https://test@sentry.io/1"};</script><title>Test</title></head><body></body></html>',
    );
  });

  it("safely escapes < characters to prevent script injection breakouts", () => {
    const rawHtml = "<!doctype html><html><head><title>Test</title></head><body></body></html>";
    const config = {
      appEnv: "production",
      mapboxAccessToken: "pk.test</script><script>alert('xss')</script>",
      mapboxStyleUrl: "mapbox://styles/test",
      sentryDsn: "https://test@sentry.io/1",
    };

    const injected = injectClientConfig(rawHtml, config);
    expect(injected).not.toContain("</script><script>");
    expect(injected).toContain("\\u003c/script>\\u003cscript>");
  });

  it("prepends script tag if no head tag exists", () => {
    const rawHtml = "<div>No head tag</div>";
    const config = {
      appEnv: "production",
      mapboxAccessToken: "",
      mapboxStyleUrl: "",
      sentryDsn: "",
    };

    const injected = injectClientConfig(rawHtml, config);
    expect(injected).toBe(
      '<script>window.__APP_CONFIG__={"appEnv":"production","mapboxAccessToken":"","mapboxStyleUrl":"","sentryDsn":""};</script><div>No head tag</div>',
    );
  });
});
