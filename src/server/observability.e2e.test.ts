import { describe, expect, it } from "bun:test";

interface CapturedTransaction {
  type?: string;
  transaction?: string;
  tags?: Record<string, unknown>;
  contexts?: {
    trace?: {
      trace_id?: string;
      parent_span_id?: string;
      op?: string;
      origin?: string;
      data?: Record<string, unknown>;
    };
  };
  spans?: Array<{ op?: string }>;
}

function transactionsFrom(envelopes: string[]): CapturedTransaction[] {
  return envelopes.flatMap((envelope) =>
    envelope
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line) as CapturedTransaction;
        } catch {
          return undefined;
        }
      })
      .filter(
        (item): item is CapturedTransaction =>
          item?.type === "transaction" && Boolean(item.contexts?.trace),
      ),
  );
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
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
  const port = reservation.port;
  await reservation.stop(true);
  if (port === undefined) {
    throw new Error("Bun did not assign a test server port");
  }
  return port;
}

describe("server observability end to end", () => {
  it(
    "emits one focused Hono transaction and filters health checks",
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
        [process.execPath, "src/server/index.ts"],
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
      const healthTraceId = "7bf92f3577b34da6a3ce929d0e0e4736";

      try {
        await waitFor(async () => {
          try {
            return (await fetch(`${applicationOrigin}/api/health`)).ok;
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
          transactionsFrom(envelopes).some(
            (transaction) =>
              transaction.contexts?.trace?.trace_id === apiTraceId,
          ),
        );

        await fetch(`${applicationOrigin}/api/health`, {
          headers: {
            "sentry-trace": `${healthTraceId}-10f067aa0ba902b7-1`,
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const apiTransactions = transactionsFrom(envelopes).filter(
          (transaction) =>
            transaction.contexts?.trace?.trace_id === apiTraceId,
        );
        expect(apiTransactions).toHaveLength(1);

        const [transaction] = apiTransactions;
        expect(transaction.transaction).toBe("GET /api/room-schedule");
        expect(transaction.contexts?.trace).toMatchObject({
          op: "http.server",
          origin: "auto.http.bun.serve",
          parent_span_id: apiParentSpanId,
          trace_id: apiTraceId,
        });
        expect(transaction.contexts?.trace?.data?.["http.request_id"]).toBe(
          "req-waterfall-test",
        );
        expect(transaction.tags?.request_id).toBe("req-waterfall-test");
        expect(
          transaction.spans?.some((span) => span.op === "middleware.hono"),
        ).toBe(false);
        expect(
          transactionsFrom(envelopes).some(
            (captured) =>
              captured.contexts?.trace?.trace_id === healthTraceId,
          ),
        ).toBe(false);
      } finally {
        application.kill();
        await application.exited;
        await collector.stop(true);
      }
    },
    10_000,
  );
});
