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
    expect(requests[0]?.init?.redirect).toBe("manual");
  });

  it("does not proxy upstream errors", async () => {
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

  it("does not proxy a successful non-image response", async () => {
    const app = createApp({
      roomImage: {
        fetchImage: async () =>
          new Response("Not an image", {
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

  it("does not follow redirects from an allowed source", async () => {
    const requests: { input: string; init?: RequestInit }[] = [];
    const app = createApp({
      roomImage: {
        fetchImage: async (input, init) => {
          requests.push({ input: String(input), init });
          return new Response(null, {
            status: 302,
            headers: { Location: "https://example.com/private.jpg" },
          });
        },
      },
    });

    const response = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );

    expect(response.status).toBe(502);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.init?.redirect).toBe("manual");
  });

  it("aborts an oversized body without buffering it", async () => {
    const oversizedBytes = new Uint8Array(15 * 1024 * 1024 + 1);
    let bodyWasCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedBytes.subarray(0, 8 * 1024 * 1024));
        controller.enqueue(oversizedBytes.subarray(8 * 1024 * 1024));
      },
      cancel() {
        bodyWasCancelled = true;
      },
    });
    const app = createApp({
      roomImage: {
        fetchImage: async () =>
          new Response(body, {
            headers: { "Content-Type": "image/jpeg" },
          }),
      },
    });

    const response = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );

    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow(
      "Room image source exceeds size limit",
    );
    expect(bodyWasCancelled).toBe(true);
  });

  it("limits concurrent image streams", async () => {
    let fetchCount = 0;
    const app = createApp({
      roomImage: {
        maxConcurrentStreams: 1,
        fetchImage: async () => {
          fetchCount += 1;
          return new Response(new ReadableStream<Uint8Array>(), {
            headers: { "Content-Type": "image/jpeg" },
          });
        },
      },
    });

    const first = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );
    const busy = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );

    expect(first.status).toBe(200);
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("1");
    expect(await busy.json()).toEqual({ error: "Room image proxy busy" });
    expect(fetchCount).toBe(1);

    await first.body?.cancel();

    const afterCancellation = await app.request(
      `/api/room-image?url=${encodeURIComponent(answersImage)}`,
    );
    expect(afterCancellation.status).toBe(200);
    expect(fetchCount).toBe(2);
    await afterCancellation.body?.cancel();
  });
});
