const IMAGE_PROXY_URL = "https://wsrv.nl/";
const ROOM_IMAGE_ROUTE = "/api/room-image";

export interface ImageTransform {
  width: number;
  height?: number;
  fit?: "inside" | "cover";
  quality?: number;
}

export function getOptimizedImageUrl(
  sourceUrl: string,
  {
    width,
    height,
    fit = "inside",
    quality = 75,
  }: ImageTransform,
  appOrigin: string | undefined = getPublicAppOrigin(),
): string {
  let source: URL;

  try {
    source = new URL(sourceUrl);
  } catch {
    return sourceUrl;
  }

  if (source.protocol !== "http:" && source.protocol !== "https:") {
    return sourceUrl;
  }

  // Fragments are browser-only and should not be part of the proxy cache key.
  source.hash = "";

  const proxySource = getProxiedSourceUrl(source, appOrigin);
  const optimized = new URL(IMAGE_PROXY_URL);
  optimized.searchParams.set("url", proxySource);
  optimized.searchParams.set("w", String(width));
  if (height !== undefined) {
    optimized.searchParams.set("h", String(height));
  }
  optimized.searchParams.set("fit", fit);
  optimized.searchParams.set("output", "webp");
  optimized.searchParams.set("q", String(quality));
  optimized.searchParams.set("maxage", "1y");

  return optimized.toString();
}

function getPublicAppOrigin(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const { hostname, origin, protocol } = window.location;
  if (
    (protocol !== "http:" && protocol !== "https:") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  ) {
    return undefined;
  }

  return origin;
}

function getProxiedSourceUrl(source: URL, appOrigin: string | undefined): string {
  if (!appOrigin || source.hostname !== "answers.uillinois.edu") {
    return source.toString();
  }

  try {
    const proxySource = new URL(ROOM_IMAGE_ROUTE, appOrigin);
    if (proxySource.protocol !== "http:" && proxySource.protocol !== "https:") {
      return source.toString();
    }
    proxySource.searchParams.set("url", source.toString());
    // Version the passthrough URL so its wsrv cache can be rotated safely.
    proxySource.searchParams.set("v", "1");
    return proxySource.toString();
  } catch {
    return source.toString();
  }
}
