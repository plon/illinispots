import { Hono } from "hono";
import { Sentry } from "../observability";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_CONCURRENT_IMAGE_STREAMS = 4;
const SOURCE_TIMEOUT_MS = 15_000;
const ANSWERS_IMAGE_PATH =
  /^\/images\/group\d+\/\d+\/[^/]+\.(?:jpe?g|png|webp)$/i;

export interface RoomImageRouteDependencies {
  fetchImage?: (
    input: string,
    init?: RequestInit,
  ) => Promise<Response>;
  maxConcurrentStreams?: number;
}

function createLimitedBodyStream(
  body: ReadableStream<Uint8Array>,
  releaseStreamSlot: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let totalBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          releaseStreamSlot();
          controller.close();
          return;
        }

        totalBytes += value.byteLength;
        if (totalBytes > MAX_SOURCE_BYTES) {
          await reader.cancel("Room image source exceeds size limit");
          releaseStreamSlot();
          controller.error(new Error("Room image source exceeds size limit"));
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        releaseStreamSlot();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseStreamSlot();
      }
    },
  });
}

export function isAllowedRoomImageUrl(sourceUrl: string): boolean {
  let source: URL;

  try {
    source = new URL(sourceUrl);
  } catch {
    return false;
  }

  if (
    source.protocol !== "https:" ||
    source.username !== "" ||
    source.password !== "" ||
    source.port !== ""
  ) {
    return false;
  }

  return (
    source.hostname === "answers.uillinois.edu" &&
    ANSWERS_IMAGE_PATH.test(source.pathname)
  );
}

export function createRoomImageRoutes(
  dependencies: RoomImageRouteDependencies = {},
) {
  const fetchImage = dependencies.fetchImage ?? fetch;
  const maxConcurrentStreams =
    dependencies.maxConcurrentStreams ?? MAX_CONCURRENT_IMAGE_STREAMS;
  let activeStreams = 0;

  return new Hono().get("/", async (context) => {
    const sourceUrl = context.req.query("url");
    if (!sourceUrl || !isAllowedRoomImageUrl(sourceUrl)) {
      return context.json({ error: "Invalid room image URL" }, 400);
    }

    if (activeStreams >= maxConcurrentStreams) {
      context.header("Retry-After", "1");
      return context.json({ error: "Room image proxy busy" }, 503);
    }

    activeStreams += 1;
    let streamSlotReleased = false;
    const releaseStreamSlot = () => {
      if (!streamSlotReleased) {
        streamSlotReleased = true;
        activeStreams -= 1;
      }
    };

    try {
      const upstream = await fetchImage(sourceUrl, {
        headers: { Accept: "image/*" },
        redirect: "manual",
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      });
      const contentType = upstream.headers.get("content-type") ?? "";
      const declaredLength = upstream.headers.get("content-length");
      const contentLength = declaredLength ? Number(declaredLength) : null;

      if (
        !upstream.ok ||
        !contentType.toLowerCase().startsWith("image/") ||
        !upstream.body ||
        (contentLength !== null &&
          Number.isSafeInteger(contentLength) &&
          contentLength > MAX_SOURCE_BYTES)
      ) {
        await upstream.body?.cancel();
        releaseStreamSlot();
        return context.json({ error: "Room image source unavailable" }, 502);
      }

      const imageStream = createLimitedBodyStream(
        upstream.body,
        releaseStreamSlot,
      );

      context.header("Content-Type", contentType);
      if (
        contentLength !== null &&
        Number.isSafeInteger(contentLength) &&
        contentLength >= 0
      ) {
        context.header("Content-Length", String(contentLength));
      }
      context.header(
        "Cache-Control",
        "public, max-age=2592000, immutable",
      );
      context.header(
        "Cloudflare-CDN-Cache-Control",
        "public, max-age=2592000, stale-while-revalidate=86400",
      );

      return context.body(imageStream);
    } catch (error) {
      releaseStreamSlot();
      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/room-image" },
      });
      console.error(`Error proxying room image ${sourceUrl}:`, error);
      return context.json({ error: "Room image source unavailable" }, 502);
    }
  });
}
