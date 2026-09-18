import { Hono } from "hono";
import { DATA_SOURCES } from "../../lib/data-sources";
import type { DataStatusResponse } from "../../types";
import { Sentry } from "../observability";

const GITHUB_API_VERSION = "2022-11-28";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60_000;
const REPO_OWNER = "plon";
const REPO_NAME = "illinispots";

export interface DataStatusRouteDependencies {
  fetchRuns?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  githubToken?: string;
}

async function fetchLatestSuccess(
  fetchRuns: (input: string, init?: RequestInit) => Promise<Response>,
  workflowFile: string,
  githubToken: string,
) {
  const url =
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/` +
    `${encodeURIComponent(workflowFile)}/runs?status=success&per_page=1`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "illinispots-data-status",
  };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const response = await fetchRuns(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub API request for ${workflowFile} failed with status ${response.status}`,
    );
  }

  const body = (await response.json()) as {
    workflow_runs?: { updated_at?: string; html_url?: string }[];
  };
  const latest = body.workflow_runs?.[0];
  return {
    updatedAt: latest?.updated_at ?? null,
    htmlUrl: latest?.html_url ?? null,
  };
}

export function createDataStatusRoutes(
  dependencies: DataStatusRouteDependencies = {},
) {
  const fetchRuns = dependencies.fetchRuns ?? fetch;
  const now = dependencies.now ?? Date.now;
  const githubToken = dependencies.githubToken ?? process.env.GITHUB_TOKEN ?? "";
  let cache: { expiresAt: number; data: DataStatusResponse } | null = null;

  return new Hono().get("/", async (context) => {
    context.header("Cache-Control", "no-store");

    const requestedAt = now();
    if (cache && requestedAt < cache.expiresAt) {
      return context.json(cache.data);
    }

    try {
      const sources = await Promise.all(
        DATA_SOURCES.map(async (source) => {
          const latest = await fetchLatestSuccess(
            fetchRuns,
            source.workflowFile,
            githubToken,
          );
          return {
            id: source.id,
            label: source.label,
            cadence: source.cadence,
            updatedAt: latest.updatedAt,
            htmlUrl: latest.htmlUrl,
          };
        }),
      );
      const data = { sources };
      cache = { data, expiresAt: requestedAt + CACHE_TTL_MS };
      return context.json(data);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/data-status" },
      });
      return context.json({ error: "Data status unavailable" }, 503);
    }
  });
}
