import { useQuery } from "@tanstack/react-query";
import type { DataSourceStatus, DataStatusResponse } from "@/types";
import { DATA_SOURCES } from "@/lib/data-sources";
import { formatDataStatusTime } from "@/utils/time";

const FALLBACK_SOURCES: DataSourceStatus[] = DATA_SOURCES.map((source) => ({
  id: source.id,
  label: source.label,
  cadence: source.cadence,
  updatedAt: null,
  htmlUrl: null,
}));

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
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
