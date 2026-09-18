import { Hono } from "hono";
import { Sentry } from "../observability";
import type { DataStatusResponse } from "../../types";
export { DATA_SOURCES } from "../../lib/data-sources";
import { DATA_SOURCES } from "../../lib/data-sources";

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
): Promise<{ updatedAt: string | null; htmlUrl: string | null }> {
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
    throw new Error(`GitHub API responded with status ${response.status}`);
  }
  const body = (await response.json()) as {
    workflow_runs?: {
      updated_at?: string;
      html_url?: string;
    }[];
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
  const nowFn = dependencies.now ?? Date.now;
  const githubToken = dependencies.githubToken ?? process.env.GITHUB_TOKEN ?? "";
  let cached: { expiresAt: number; data: DataStatusResponse } | null = null;

  return new Hono().get("/", async (context) => {
    const now = nowFn();
    if (cached && now < cached.expiresAt) {
      context.header("Cache-Control", "public, max-age=0, s-maxage=600");
      return context.json(cached.data);
    }

    const results = await Promise.all(
      DATA_SOURCES.map(async (source) => {
        try {
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
            ok: true as const,
          };
        } catch (error) {
          Sentry.captureException(error, {
            tags: { component: "api", route: "/api/data-status" },
          });
          console.error(
            `Error fetching data status for ${source.workflowFile}:`,
            error,
          );
          return {
            id: source.id,
            label: source.label,
            cadence: source.cadence,
            updatedAt: null,
            htmlUrl: null,
            ok: false as const,
          };
        }
      }),
    );

    const allSucceeded = results.every((result) => result.ok);
    const sources = results.map((result) => ({
      id: result.id,
      label: result.label,
      cadence: result.cadence,
      updatedAt: result.updatedAt,
      htmlUrl: result.htmlUrl,
    }));

    const data: DataStatusResponse = {
      fetchedAt: new Date(now).toISOString(),
      sources,
    };
    if (allSucceeded) {
      cached = { expiresAt: now + CACHE_TTL_MS, data };
      context.header("Cache-Control", "public, max-age=0, s-maxage=600");
    } else {
      context.header("Cache-Control", "no-store");
    }
    return context.json(data);
  });
}
