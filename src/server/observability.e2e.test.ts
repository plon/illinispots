import { describe, expect, it } from "bun:test";

interface CapturedError {
  exception?: { values: { value: string }[] };
  contexts?: { trace?: { trace_id?: string } };
  tags?: Record<string, string>;
  environment?: string;
  user?: { ip_address?: string };
}

interface CapturedSpan {
  trace_id: string;
  parent_span_id?: string;
  name: string;
  is_segment: boolean;
  attributes: Record<string, { value: unknown }>;
}

function jsonLines<T extends object>(envelopes: string[]): T[] {
  return envelopes.flatMap((envelope) =>
    envelope.split("\n").flatMap((line) => {
      try {
        const item: unknown = JSON.parse(line);
        return item && typeof item === "object" && !Array.isArray(item)
          ? [item as T]
          : [];
      } catch {
        return [];
      }
    }),
  );
}

function spansFrom(envelopes: string[]): CapturedSpan[] {
  return jsonLines<{ version?: number; items?: CapturedSpan[] }>(envelopes)
    .flatMap((container) =>
      container.version === 2 && Array.isArray(container.items)
        ? container.items
        : [],
    );
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling helper: each check must run sequentially after the previous one
    if (await predicate()) {return;}
    // oxlint-disable-next-line no-await-in-loop -- polling delay must run sequentially between checks; Promise.all does not apply
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

async function reservePort(): Promise<number> {
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("reserved"),
  });
  const {port} = reservation;
  await reservation.stop(true);
  if (port === undefined) {
    throw new Error("Bun did not assign a test server port");
  }
  return port;
}

describe("server observability end to end", () => {
  it(
    "streams one Hono server span and filters health checks",
    async () => {
      const envelopes: string[] = [];
      const collector = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          envelopes.push(await request.text());
          return new Response("ok");
        },
      });
      const collectorPort = collector.port;
      if (collectorPort === undefined) {
        await collector.stop(true);
        throw new Error("Bun did not assign a Sentry collector port");
      }
      const applicationPort = await reservePort();
      const applicationOrigin = `http://127.0.0.1:${applicationPort}`;
      const application = Bun.spawn(
        [process.execPath, "src/server/fixtures/observability-app.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            APP_ENV: "test",
            NODE_ENV: "test",
            PORT: String(applicationPort),
            SENTRY_DSN: `http://public@127.0.0.1:${collectorPort}/1`,
          },
          stdout: "ignore",
          stderr: "inherit",
        },
      );

      const apiTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
      const apiParentSpanId = "00f067aa0ba902b7";
      const errorTraceId = "8bf92f3577b34da6a3ce929d0e0e4736";
      const healthTraceId = "7bf92f3577b34da6a3ce929d0e0e4736";

      try {
        await waitFor(async () => {
          try {
            const healthResponse = await fetch(`${applicationOrigin}/api/health`);
            return healthResponse.ok;
          } catch {
            return false;
          }
        });

        const apiResponse = await fetch(
          `${applicationOrigin}/api/room-schedule`,
          {
            headers: {
              baggage: [
                "sentry-environment=test",
                "sentry-public_key=public",
                `sentry-trace_id=${apiTraceId}`,
                "sentry-sample_rate=1",
                "sentry-sampled=true",
              ].join(","),
              "sentry-trace": `${apiTraceId}-${apiParentSpanId}-1`,
              "x-request-id": "req-waterfall-test",
            },
          },
        );
        expect(apiResponse.status).toBe(400);

        await waitFor(() =>
          spansFrom(envelopes).some(
            (span) => span.trace_id === apiTraceId && span.is_segment,
          ),
        );

        await fetch(`${applicationOrigin}/api/health`, {
          headers: {
            "sentry-trace": `${healthTraceId}-10f067aa0ba902b7-1`,
          },
        });

        const apiSpans = spansFrom(envelopes).filter(
          (span) => span.trace_id === apiTraceId,
        );
        const serverSpans = apiSpans.filter(
          (span) => span.attributes["sentry.op"]?.value === "http.server",
        );
        expect(serverSpans).toHaveLength(1);

        const [span] = serverSpans;
        expect(span.name).toBe("GET /api/room-schedule");
        expect(span.is_segment).toBe(true);
        expect(span.parent_span_id).toBe(apiParentSpanId);
        expect(span.attributes["sentry.origin"]?.value).toBe(
          "auto.http.bun.serve",
        );
        expect(span.attributes["http.request_id"]?.value).toBe(
          "req-waterfall-test",
        );
        expect(span.attributes.request_id?.value).toBe("req-waterfall-test");
        expect(
          apiSpans.some(
            (item) =>
              item.attributes["sentry.origin"]?.value === "auto.middleware.hono",
          ),
        ).toBe(false);

        const errorResponse = await fetch(
          `${applicationOrigin}/api/room-schedule?buildingId=test&roomNumber=1&token=private-query-sentinel`,
          {
            headers: {
              "sentry-trace": `${errorTraceId}-${apiParentSpanId}-1`,
              "x-request-id": "req-error-test",
              authorization: "Bearer private-auth-sentinel",
              cookie: "session=private-cookie-sentinel",
              "x-forwarded-for": "198.51.100.42",
            },
          },
        );
        expect(errorResponse.status).toBe(500);
        await waitFor(() =>
          envelopes.some(
            (envelope) =>
              envelope.includes('"exception"') && envelope.includes(errorTraceId),
          ),
        );
        await waitFor(() =>
          spansFrom(envelopes).some(
            (item) => item.trace_id === errorTraceId && item.is_segment,
          ),
        );
        const errorSpans = spansFrom(envelopes).filter(
          (item) =>
            item.trace_id === errorTraceId &&
            item.attributes["sentry.op"]?.value === "http.server",
        );
        expect(errorSpans).toHaveLength(1);
        expect(errorSpans[0].attributes.request_id?.value).toBe("req-error-test");
        const events = jsonLines<CapturedError>(envelopes).filter(
          (item) =>
            item.exception && item.contexts?.trace?.trace_id === errorTraceId,
        );
        expect(events).toHaveLength(1);
        expect(events[0].exception?.values[0].value).toBe(
          "Sentry migration test error",
        );
        expect(events[0].tags?.request_id).toBe("req-error-test");
        expect(events[0].environment).toBe("test");
        expect(events[0].user?.ip_address).toBeUndefined();
        expect(
          spansFrom(envelopes).some((item) => item.trace_id === healthTraceId),
        ).toBe(false);
        const payload = envelopes.join("\n");
        for (const sensitive of [
          "private-query-sentinel",
          "private-auth-sentinel",
          "private-cookie-sentinel",
          "198.51.100.42",
        ]) {
          expect(payload).not.toContain(sensitive);
        }
      } finally {
        application.kill();
        await application.exited;
        await collector.stop(true);
      }
    },
    10_000,
  );
});
