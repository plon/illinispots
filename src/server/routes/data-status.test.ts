import { describe, expect, it } from "bun:test";
import { createApp } from "../app";
import { DATA_SOURCES } from "./data-status";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

describe("GET /api/data-status", () => {
  it("returns cadence plus the latest success time without leaking internals", async () => {
    const urls: string[] = [];
    const app = createApp({
      dataStatus: {
        fetchRuns: async (input) => {
          urls.push(input);
          if (input.includes("tableau-daily-events.yml")) {
            return jsonResponse({
              workflow_runs: [
                {
                  updated_at: "2026-09-15T12:05:00Z",
                  html_url: "https://github.com/plon/illinispots/actions/runs/1",
                  conclusion: "success",
                },
              ],
            });
          }
          return jsonResponse({
            workflow_runs: [
              {
                updated_at: "2026-09-12T09:17:00Z",
                html_url: "https://github.com/plon/illinispots/actions/runs/2",
                conclusion: "success",
              },
            ],
          });
        },
      },
    });

    const response = await app.request("/api/data-status");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=600",
    );
    const body = await response.json();
    expect(body.sources).toEqual([
      {
        id: "daily-events",
        label: "General campus events",
        cadence: "Daily",
        updatedAt: "2026-09-15T12:05:00Z",
        htmlUrl: "https://github.com/plon/illinispots/actions/runs/1",
      },
      {
        id: "class-schedules",
        label: "Class schedules",
        cadence: "Weekly",
        updatedAt: "2026-09-12T09:17:00Z",
        htmlUrl: "https://github.com/plon/illinispots/actions/runs/2",
      },
    ]);
    expect(urls).toHaveLength(DATA_SOURCES.length);
    for (const url of urls) {
      expect(url).toContain("status=success");
      expect(url).toContain("per_page=1");
    }
  });

  it("serves the second request from cache without hitting GitHub again", async () => {
    let calls = 0;
    const app = createApp({
      dataStatus: {
        fetchRuns: async () => {
          calls += 1;
          return jsonResponse({
            workflow_runs: [{ updated_at: "2026-09-15T12:05:00Z" }],
          });
        },
      },
    });

    await app.request("/api/data-status");
    const afterFirst = calls;
    expect(afterFirst).toBe(DATA_SOURCES.length);
    const cachedResponse = await app.request("/api/data-status");
    expect(calls - afterFirst).toBe(0);
    expect(cachedResponse.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=600",
    );
  });

  it("refetches once the cache TTL expires", async () => {
    let now = 1_000_000;
    let calls = 0;
    const app = createApp({
      dataStatus: {
        now: () => now,
        fetchRuns: async () => {
          calls += 1;
          return jsonResponse({
            workflow_runs: [{ updated_at: "2026-09-15T12:05:00Z" }],
          });
        },
      },
    });

    await app.request("/api/data-status");
    await app.request("/api/data-status");
    const afterTwoCached = calls;
    expect(afterTwoCached).toBe(DATA_SOURCES.length);

    now += 10 * 60_000 + 1;
    await app.request("/api/data-status");
    expect(calls - afterTwoCached).toBe(DATA_SOURCES.length);
  });

  it("does not cache a fully degraded response", async () => {
    let fail = true;
    let calls = 0;
    const app = createApp({
      dataStatus: {
        fetchRuns: async () => {
          calls += 1;
          if (fail) {
            return new Response("rate limited", { status: 403 });
          }
          return jsonResponse({
            workflow_runs: [
              {
                updated_at: "2026-09-15T12:05:00Z",
                html_url: "https://github.com/plon/illinispots/actions/runs/1",
              },
            ],
          });
        },
      },
    });

    const degradedResponse = await app.request("/api/data-status");
    const degradedBody = await degradedResponse.json();
    expect(degradedBody.sources[0].updatedAt).toBeNull();
    expect(degradedResponse.headers.get("cache-control")).toBe("no-store");
    const afterDegraded = calls;
    expect(afterDegraded).toBe(DATA_SOURCES.length);

    fail = false;
    const recoveredResponse = await app.request("/api/data-status");
    const recoveredBody = await recoveredResponse.json();
    expect(recoveredBody.sources[0].updatedAt).toBe(
      "2026-09-15T12:05:00Z",
    );
    expect(calls - afterDegraded).toBe(DATA_SOURCES.length);
  });

  it("caches successful empty run lists instead of refetching", async () => {
    let calls = 0;
    const app = createApp({
      dataStatus: {
        fetchRuns: async () => {
          calls += 1;
          return jsonResponse({ workflow_runs: [] });
        },
      },
    });

    const first = await app.request("/api/data-status");
    const firstBody = await first.json();
    expect(firstBody.sources.every((s: { updatedAt: null }) => s.updatedAt === null)).toBe(
      true,
    );
    expect(first.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=600",
    );
    const afterFirst = calls;
    expect(afterFirst).toBe(DATA_SOURCES.length);

    await app.request("/api/data-status");
    expect(calls - afterFirst).toBe(0);
  });

  it("sends the GitHub token only when configured", async () => {
    const seen: Record<string, string>[] = [];
    const authed = createApp({
      dataStatus: {
        githubToken: "secret",
        fetchRuns: async (_input, init) => {
          seen.push({ ...(init?.headers as Record<string, string>) });
          return jsonResponse({ workflow_runs: [] });
        },
      },
    });
    await authed.request("/api/data-status");
    expect(seen[0]?.Authorization).toBe("Bearer secret");

    seen.length = 0;
    const anonymous = createApp({
      dataStatus: {
        githubToken: "",
        fetchRuns: async (_input, init) => {
          seen.push({ ...(init?.headers as Record<string, string>) });
          return jsonResponse({ workflow_runs: [] });
        },
      },
    });
    await anonymous.request("/api/data-status");
    expect(seen[0]?.Authorization).toBeUndefined();
  });
});
