import { describe, expect, it } from "bun:test";
import { createApp } from "../app";
import { isAllowedRoomImageUrl } from "./room-image";

const answersImage =
  "https://answers.uillinois.edu/images/group180/57485/Armory_136_RoomView.JPG";

describe("GET /api/room-image", () => {
  it("only accepts known public room-image paths", () => {
    expect(isAllowedRoomImageUrl(answersImage)).toBe(true);
    expect(
      isAllowedRoomImageUrl(
        "https://uofi.box.com/shared/static/d28q7f6bgko529428b1un5pwypk2lt2v.jpg",
      ),
    ).toBe(false);
    expect(isAllowedRoomImageUrl("http://answers.uillinois.edu/image.jpg")).toBe(
      false,
    );
    expect(isAllowedRoomImageUrl("https://example.com/image.jpg")).toBe(false);
    expect(
      isAllowedRoomImageUrl("https://answers.uillinois.edu/illinois/57128"),
    ).toBe(false);
  });

  it("rejects a missing or disallowed source without fetching it", async () => {
    let fetchCount = 0;
    const app = createApp({
      roomImage: {
        fetchImage: async () => {
          fetchCount += 1;
          return new Response();
        },
      },
    });

    const missing = await app.request("/api/room-image");
    const disallowed = await app.request(
      "/api/room-image?url=https%3A%2F%2Fexample.com%2Fimage.jpg",
    );

    expect(missing.status).toBe(400);
    expect(disallowed.status).toBe(400);
    expect(fetchCount).toBe(0);
  });

  it("streams an allowed image with shared-cache headers", async () => {
    const requests: { input: string; init?: RequestInit }[] = [];
    const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
    const app = createApp({
      roomImage: {
        fetchImage: async (input, init) => {
          requests.push({ input: String(input), init });
          return new Response(bytes, {
            headers: {
              "Content-Type": "image/jpeg",
              "Content-Length": String(bytes.byteLength),
            },
          });
        },
      },
    });

    const response = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=2592000, immutable",
    );
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
      "public, max-age=2592000, stale-while-revalidate=86400",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(answersImage);
    expect(requests[0]?.init?.redirect).toBe("follow");
  });

  it("does not proxy upstream errors or non-images", async () => {
    const app = createApp({
      roomImage: {
        fetchImage: async () =>
          new Response("Forbidden", {
            status: 403,
            headers: { "Content-Type": "text/plain" },
          }),
      },
    });

    const response = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Room image source unavailable",
    });
  });
});
