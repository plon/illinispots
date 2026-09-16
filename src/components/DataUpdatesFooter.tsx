import { useQuery } from "@tanstack/react-query";
import type { DataSourceStatus, DataStatusResponse } from "@/types";
import { formatDataStatusTime } from "@/utils/time";

const DATA_STATUS_CACHE_TIME_MS = 10 * 60_000;

const FALLBACK_SOURCES: DataSourceStatus[] = [
  {
    id: "daily-events",
    label: "General campus events",
    cadence: "Daily",
    updatedAt: null,
    htmlUrl: null,
  },
  {
    id: "class-schedules",
    label: "Class schedules",
    cadence: "Weekly",
    updatedAt: null,
    htmlUrl: null,
  },
];

async function fetchDataStatus(): Promise<DataStatusResponse> {
  const response = await fetch("/api/data-status");
  if (!response.ok) {
    throw new Error(`Data status request failed with ${response.status}`);
  }
  return response.json();
}

export function DataUpdatesFooter() {
  const { data } = useQuery<DataStatusResponse>({
    queryKey: ["data-status"],
    queryFn: fetchDataStatus,
    staleTime: DATA_STATUS_CACHE_TIME_MS,
    gcTime: DATA_STATUS_CACHE_TIME_MS,
    refetchOnMount: true,
  });
  const sources = data?.sources ?? FALLBACK_SOURCES;

  return (
    <div className="px-3 py-2 text-xs text-muted-foreground space-y-1">
      <p>
        <span className="font-medium text-foreground">Data Updates:</span>
      </p>
      {sources.map((source) => {
        const formatted = formatDataStatusTime(source.updatedAt);
        return (
          <p key={source.id}>
            • {source.label}: {source.cadence}
            {formatted ? (
              <>
                {" · "}
                {source.htmlUrl ? (
                  <a
                    href={source.htmlUrl}
                    target="_blank"
                    rel="noopener"
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                    title={`Last successful run ${formatted}`}
                  >
                    Updated {formatted}
                  </a>
                ) : (
                  <span>Updated {formatted}</span>
                )}
              </>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
