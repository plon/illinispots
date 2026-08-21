import { describe, expect, it } from "bun:test";
import { resolveClientSentryEnvironment } from "./observability";

describe("resolveClientSentryEnvironment", () => {
  it("uses the Vercel target so custom environments retain their name", () => {
    expect(
      resolveClientSentryEnvironment({
        VITE_VERCEL_TARGET_ENV: "staging",
        VITE_VERCEL_ENV: "preview",
        MODE: "production",
      }),
    ).toBe("staging");
  });

  it("falls back through the standard Vercel and Vite environments", () => {
    expect(
      resolveClientSentryEnvironment({
        VITE_VERCEL_ENV: "preview",
        MODE: "production",
      }),
    ).toBe("preview");
    expect(resolveClientSentryEnvironment({ MODE: "development" })).toBe(
      "development",
    );
  });
});
