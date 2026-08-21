import { existsSync, readFileSync } from "node:fs";
import type { PublicClientConfig } from "./config";

const HEAD_TAG_REGEX = /<head(?:\s+[^>]*)?>/i;

export function injectClientConfig(
  rawHtml: string,
  config: PublicClientConfig,
): string {
  const safeJson = JSON.stringify(config).replace(/</g, "\\u003c");
  const scriptTag = `<script>window.__APP_CONFIG__=${safeJson};</script>`;

  if (HEAD_TAG_REGEX.test(rawHtml)) {
    return rawHtml.replace(HEAD_TAG_REGEX, `$&${scriptTag}`);
  }
  return `${scriptTag}${rawHtml}`;
}

export function loadIndexHtml(filePath: string): string {
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf-8");
}
