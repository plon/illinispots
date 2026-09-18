import { describe, expect, it } from "bun:test";
import { DATA_SOURCES } from "../../lib/data-sources";
import { createApp } from "../app";

const UPDATED_AT = "2026-09-15T12:05:00Z";

function runResponse(updatedAt = UPDATED_AT) {
  return Response.json({
    workflow_runs: [
      {
        updated_at: updatedAt,
        html_url: "https://github.com/plon/illinispots/actions/runs/1",
      },
    ],
  });
}

describe("GET /api/data-status", () => {
  it("returns the latest successful run for each configured source", async () => {
    const requests: { url: string; headers: Record<string, string> }[] = [];
    const app = createApp({
      dataStatus: {
        githubToken: "secret",
        fetchRuns: async (url, init) => {
          requests.push({
            url,
            headers: init?.headers as Record<string, string>,
          });
          return runResponse();
        },
      },
    });

    const response = await app.request("/api/data-status");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.sources).toHaveLength(DATA_SOURCES.length);
    expect(body.sources[0]).toEqual({
      id: "daily-events",
      label: "General campus events",
      cadence: "Daily",
      updatedAt: UPDATED_AT,
      htmlUrl: "https://github.com/plon/illinispots/actions/runs/1",
    });
    expect(requests.every(({ url }) =>
      url.includes("status=success&per_page=1")
    )).toBe(true);
    expect(requests.every(({ headers }) =>
      headers.Authorization === "Bearer secret"
    )).toBe(true);
  });

  it("caches successful responses for ten minutes", async () => {
    let currentTime = 1_000_000;
    let calls = 0;
    const app = createApp({
      dataStatus: {
        now: () => currentTime,
        fetchRuns: async () => {
          calls += 1;
          return runResponse();
        },
      },
    });

    await app.request("/api/data-status");
    await app.request("/api/data-status");
    expect(calls).toBe(DATA_SOURCES.length);

    currentTime += 10 * 60_000 + 1;
    await app.request("/api/data-status");
    expect(calls).toBe(DATA_SOURCES.length * 2);
  });

  it("omits authorization when no GitHub token is configured", async () => {
    const headers: Record<string, string>[] = [];
    const app = createApp({
      dataStatus: {
        githubToken: "",
        fetchRuns: async (_url, init) => {
          headers.push(init?.headers as Record<string, string>);
          return runResponse();
        },
      },
    });

    await app.request("/api/data-status");
    expect(headers.every((header) => header.Authorization === undefined)).toBe(
      true,
    );
  });

  it("preserves successful sources when another source fails", async () => {
    const app = createApp({
      dataStatus: {
        fetchRuns: async (url) =>
          url.includes("tableau-daily-events.yml")
            ? new Response("not found", { status: 404 })
            : runResponse(),
      },
    });

    const response = await app.request("/api/data-status");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sources[0].updatedAt).toBeNull();
    expect(body.sources[1].updatedAt).toBe(UPDATED_AT);
  });

  it("returns 503 on failure and retries the next request", async () => {
    let shouldFail = true;
    let calls = 0;
    const app = createApp({
      dataStatus: {
        fetchRuns: async () => {
          calls += 1;
          return shouldFail
            ? new Response("rate limited", { status: 403 })
            : runResponse();
        },
      },
    });

    const unavailable = await app.request("/api/data-status");
    expect(unavailable.status).toBe(503);
    expect(calls).toBe(DATA_SOURCES.length);

    shouldFail = false;
    const recovered = await app.request("/api/data-status");
    expect(recovered.status).toBe(200);
    expect(calls).toBe(DATA_SOURCES.length * 2);
  });
});
