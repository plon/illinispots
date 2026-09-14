import { describe, expect, it } from "bun:test";
import { getOptimizedImageUrl } from "./imageUrl";

describe("getOptimizedImageUrl", () => {
  it("builds an encoded wsrv.nl URL with the requested transform", () => {
    const result = getOptimizedImageUrl(
      "https://answers.uillinois.edu/images/group180/12345/room%20photo.jpg?version=1&crop=full#preview",
      { width: 192, height: 128, fit: "cover" },
      "https://staging.illinispots.com",
    );
    const resultUrl = new URL(result);

    expect(resultUrl.origin).toBe("https://wsrv.nl");
    expect(resultUrl.searchParams.get("url")).toBe(
      "https://staging.illinispots.com/api/room-image?url=https%3A%2F%2Fanswers.uillinois.edu%2Fimages%2Fgroup180%2F12345%2Froom%2520photo.jpg%3Fversion%3D1%26crop%3Dfull&v=1",
    );
    expect(resultUrl.searchParams.get("w")).toBe("192");
    expect(resultUrl.searchParams.get("h")).toBe("128");
    expect(resultUrl.searchParams.get("fit")).toBe("cover");
    expect(resultUrl.searchParams.get("output")).toBe("webp");
    expect(resultUrl.searchParams.get("q")).toBe("75");
    expect(resultUrl.searchParams.get("maxage")).toBe("1y");
  });

  it("uses inside fitting and accepts a custom quality", () => {
    const result = new URL(
      getOptimizedImageUrl("http://example.com/room.jpg", {
        width: 960,
        quality: 80,
      }),
    );

    expect(result.searchParams.get("h")).toBeNull();
    expect(result.searchParams.get("fit")).toBe("inside");
    expect(result.searchParams.get("q")).toBe("80");
  });

  it("uses the source directly when no public app origin is available", () => {
    const sourceUrl = "https://answers.uillinois.edu/images/room.jpg";
    const result = new URL(
      getOptimizedImageUrl(sourceUrl, { width: 96 }, undefined),
    );

    expect(result.searchParams.get("url")).toBe(sourceUrl);
  });

  it("does not route other image hosts through the Answers passthrough", () => {
    const sourceUrl =
      "https://uofi.box.com/shared/static/d28q7f6bgko529428b1un5pwypk2lt2v.jpg";
    const result = new URL(
      getOptimizedImageUrl(
        sourceUrl,
        { width: 96 },
        "https://staging.illinispots.com",
      ),
    );

    expect(result.searchParams.get("url")).toBe(sourceUrl);
  });

  it("handles a window shim without a location", () => {
    const originalWindow = globalThis.window;
    globalThis.window = {} as Window & typeof globalThis;

    try {
      const sourceUrl =
        "https://answers.uillinois.edu/images/group180/12345/room.jpg";
      const result = new URL(getOptimizedImageUrl(sourceUrl, { width: 96 }));

      expect(result.searchParams.get("url")).toBe(sourceUrl);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it.each(["/room.jpg", "data:image/png;base64,abc", "not a url"])(
    "leaves a non-remote source unchanged: %s",
    (sourceUrl) => {
      expect(getOptimizedImageUrl(sourceUrl, { width: 96 })).toBe(sourceUrl);
    },
  );
});
