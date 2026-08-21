import { existsSync, readFileSync } from "node:fs";
import type { PublicClientConfig } from "./config";

export function injectClientConfig(
  rawHtml: string,
  config: PublicClientConfig,
): string {
  const safeJson = JSON.stringify(config).replace(/</g, "\\u003c");
  const scriptTag = `<script>window.__APP_CONFIG__=${safeJson};</script>`;

  if (rawHtml.includes("<head>")) {
    return rawHtml.replace("<head>", `<head>${scriptTag}`);
  }
  return `${scriptTag}${rawHtml}`;
}

export function loadIndexHtml(filePath: string): string {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf-8");
}
