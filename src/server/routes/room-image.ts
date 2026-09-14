import { Hono } from "hono";
import { Sentry } from "../observability";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 15_000;
const ANSWERS_IMAGE_PATH =
  /^\/images\/group\d+\/\d+\/[^/]+\.(?:jpe?g|png|webp)$/i;

export interface RoomImageRouteDependencies {
  fetchImage?: (
    input: string,
    init?: RequestInit,
  ) => Promise<Response>;
}

async function readLimitedBody(
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- stream reads require sequential backpressure
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_SOURCE_BYTES) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- finish cancellation before returning
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
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

  return new Hono().get("/", async (context) => {
    const sourceUrl = context.req.query("url");
    if (!sourceUrl || !isAllowedRoomImageUrl(sourceUrl)) {
      return context.json({ error: "Invalid room image URL" }, 400);
    }

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
        return context.json({ error: "Room image source unavailable" }, 502);
      }

      const imageBytes = await readLimitedBody(upstream.body);
      if (!imageBytes) {
        return context.json({ error: "Room image source unavailable" }, 502);
      }

      context.header("Content-Type", contentType);
      context.header("Content-Length", String(imageBytes.byteLength));
      context.header(
        "Cache-Control",
        "public, max-age=2592000, immutable",
      );
      context.header(
        "Cloudflare-CDN-Cache-Control",
        "public, max-age=2592000, stale-while-revalidate=86400",
      );

      return context.body(imageBytes.buffer as ArrayBuffer);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/room-image" },
      });
      console.error(`Error proxying room image ${sourceUrl}:`, error);
      return context.json({ error: "Room image source unavailable" }, 502);
    }
  });
}
