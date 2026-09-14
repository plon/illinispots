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
        redirect: "follow",
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      });
      const contentType = upstream.headers.get("content-type") ?? "";
      const contentLength = Number(
        upstream.headers.get("content-length") ?? "0",
      );

      if (
        !upstream.ok ||
        !contentType.toLowerCase().startsWith("image/") ||
        !upstream.body ||
        (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES)
      ) {
        return context.json({ error: "Room image source unavailable" }, 502);
      }

      context.header("Content-Type", contentType);
      if (contentLength > 0) {
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

      return context.body(upstream.body);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/room-image" },
      });
      console.error(`Error proxying room image ${sourceUrl}:`, error);
      return context.json({ error: "Room image source unavailable" }, 502);
    }
  });
}
