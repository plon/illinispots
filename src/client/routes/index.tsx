import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getCampusDateTimeParts,
  type CampusDateTime,
} from "@/utils/time";
import LeftSidebar from "@/components/left";
import type { FacilityStatus, FacilityType } from "@/types";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import {
  recordInitialLoadMilestone,
  type InitialLoadMilestone,
} from "@/utils/loadingMetrics";
import {
  ageLiveAvailability,
  LIVE_REFRESH_INTERVAL_MS,
  shouldRefetchFacilitiesOnReconnect,
} from "@/utils/liveUpdates";
import { useShowMapPreference } from "@/hooks/useShowMapPreference";
const FacilityMap = lazy(() => import("@/components/map"));

function MapLoadingFallback() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
        <div className="loading-bar h-full" />
      </div>
      <span className="text-sm text-muted-foreground">Loading map…</span>
    </div>
  );
}

const SIDEBAR_WIDTH_STORAGE_KEY = "illinispots:sidebarWidth";
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 720;
const SIDEBAR_DEFAULT_WIDTH = 480;
const MAP_MIN_WIDTH = 340;

const clampSidebarWidth = (width: number, containerWidth?: number) => {
  const maxByMap =
    containerWidth && containerWidth > 0
      ? containerWidth - MAP_MIN_WIDTH
      : SIDEBAR_MAX_WIDTH;
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    maxByMap,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
};

const readInitialSidebarWidth = () => {
  if (typeof window === "undefined") {return SIDEBAR_DEFAULT_WIDTH;}
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return clampSidebarWidth(parsed);
    }
    return clampSidebarWidth(window.innerWidth * 0.37);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
};

const fetchFacilityData = async (
  selectedDateTime: CampusDateTime,
  type: "academic" | "library",
): Promise<FacilityStatus> => {
  const dateParam = selectedDateTime.date;
  const timeParam = selectedDateTime.time;
  const apiUrl = `/api/facilities?date=${dateParam}&time=${timeParam}&type=${type}`;

  const res = await fetch(apiUrl);
  if (!res.ok) {
    const errorBody = await res.text();
    console.error("API Error Response:", errorBody);
    throw new Error(`Request failed with status ${res.status}. URL: ${apiUrl}`);
  }
  const data = await res.json();
  // Ensure facilities object exists, even if empty
  if (!data.facilities) {
    data.facilities = {};
  }
  return data;
};

const IlliniSpotsPage: React.FC = () => {
  const posthog = usePostHog();
  const { selectedDateTime, liveNow, isCurrentDateTime } = useDateTimeContext();
  const [showMap, setShowMap] = useShowMapPreference();
  const [expandedFacilityIds, setExpandedFacilityIds] = useState<string[]>([]);
  const [scrollTarget, setScrollTarget] = useState<{
    id: string | null;
    timestamp: number;
  }>({ id: null, timestamp: 0 });
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    readInitialSidebarWidth,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingWidthRef = useRef(sidebarWidth);

  const commitSidebarWidth = useCallback((width: number) => {
    const next = clampSidebarWidth(
      width,
      containerRef.current?.getBoundingClientRect().width,
    );
    pendingWidthRef.current = next;
    containerRef.current?.style.setProperty("--sidebar-width", `${next}px`);
    setSidebarWidth(next);
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
    } catch {
      // Storage unavailable, width still applies for this session.
    }
  }, []);

  // During a drag the width is written straight to the container's CSS
  // variable so the list does not re-render on every pixel. React state
  // only commits on release.
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startWidth: pendingWidthRef.current,
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  const handleResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) {return;}
      const next = clampSidebarWidth(
        drag.startWidth + (event.clientX - drag.startX),
        containerRef.current?.getBoundingClientRect().width,
      );
      pendingWidthRef.current = next;
      containerRef.current?.style.setProperty("--sidebar-width", `${next}px`);
    },
    [],
  );

  const endResizeDrag = useCallback(() => {
    if (!dragRef.current) {return;}
    dragRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    commitSidebarWidth(pendingWidthRef.current);
  }, [commitSidebarWidth]);

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 64 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitSidebarWidth(pendingWidthRef.current - step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commitSidebarWidth(pendingWidthRef.current + step);
      } else if (event.key === "Home") {
        event.preventDefault();
        commitSidebarWidth(SIDEBAR_MIN_WIDTH);
      } else if (event.key === "End") {
        event.preventDefault();
        commitSidebarWidth(SIDEBAR_MAX_WIDTH);
      }
    },
    [commitSidebarWidth],
  );

  const handleExpandedFacilityIdsChange = useCallback(
    (facilityIds: string[]) => {
      setExpandedFacilityIds(facilityIds);
    },
    [],
  );

  const handleExternalSelectFacility = useCallback((facilityId: string) => {
    setExpandedFacilityIds((prev) =>
      prev.includes(facilityId) ? prev : [...prev, facilityId],
    );
    setScrollTarget({
      id: facilityId,
      timestamp: Date.now(),
    });
  }, []);
  const recordedLoadMilestones = useRef(new Set<InitialLoadMilestone>());

  const recordLoadMilestone = useCallback(
    (milestone: InitialLoadMilestone) => {
      if (recordedLoadMilestones.current.has(milestone)) {
        return;
      }

      recordedLoadMilestones.current.add(milestone);
      recordInitialLoadMilestone(milestone, showMap);
    },
    [showMap],
  );

  const {
    data: academicData,
    isLoading: isAcademicLoading,
    isFetching: isAcademicFetching,
    error: academicQueryError,
    isSuccess: isAcademicSuccess,
    refetch: refetchAcademic,
  } = useQuery<FacilityStatus, Error>({
    queryKey: [
      "facilities",
      "academic",
      isCurrentDateTime ? "live" : `${selectedDateTime.date}T${selectedDateTime.time}`,
    ],
    queryFn: () =>
      fetchFacilityData(
        isCurrentDateTime ? getCampusDateTimeParts() : selectedDateTime,
        "academic",
      ),
    staleTime: isCurrentDateTime ? 0 : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: () =>
      shouldRefetchFacilitiesOnReconnect(isCurrentDateTime),
    placeholderData: keepPreviousData,
  });

  const {
    data: libraryData,
    isFetching: isLibraryFetching,
    isSuccess: isLibrarySuccess,
    refetch: refetchLibrary,
  } = useQuery<FacilityStatus, Error>({
    queryKey: [
      "facilities",
      "library",
      isCurrentDateTime ? "live" : `${selectedDateTime.date}T${selectedDateTime.time}`,
    ],
    queryFn: () =>
      fetchFacilityData(
        isCurrentDateTime ? getCampusDateTimeParts() : selectedDateTime,
        "library",
      ),
    staleTime: isCurrentDateTime ? 0 : 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: () =>
      shouldRefetchFacilitiesOnReconnect(isCurrentDateTime),
    placeholderData: keepPreviousData,
  });

  const facilityData = useMemo<FacilityStatus | undefined>(() => {
    const currentAcademicData = isCurrentDateTime
      ? ageLiveAvailability(academicData, liveNow)
      : academicData;
    const currentLibraryData = isCurrentDateTime
      ? ageLiveAvailability(libraryData, liveNow)
      : libraryData;

    if (!currentAcademicData && !currentLibraryData) {
      return undefined;
    }

    const matchingLibraryFacilities =
      isCurrentDateTime ||
      !currentAcademicData ||
      !currentLibraryData ||
      currentLibraryData.timestamp === currentAcademicData.timestamp
        ? currentLibraryData?.facilities || {}
        : {};

    return {
      timestamp:
        currentAcademicData?.timestamp || currentLibraryData?.timestamp || "",
      facilities: {
        ...currentAcademicData?.facilities,
        ...matchingLibraryFacilities,
      },
    };
  }, [academicData, isCurrentDateTime, libraryData, liveNow]);

  useEffect(() => {
    if (!isCurrentDateTime) {return;}

    let timeoutId: number | undefined;
    let cancelled = false;

    const scheduleNextRefresh = () => {
      if (cancelled) {return;}

      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        void Promise.all([refetchAcademic(), refetchLibrary()]).finally(
          scheduleNextRefresh,
        );
      }, LIVE_REFRESH_INTERVAL_MS);
    };

    scheduleNextRefresh();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {window.clearTimeout(timeoutId);}
    };
  }, [isCurrentDateTime, refetchAcademic, refetchLibrary]);

  const error = academicQueryError ? academicQueryError.message : null;

  useEffect(() => {
    if (isAcademicSuccess && academicData) {
      recordLoadMilestone("academic_data_ready");
      recordLoadMilestone("content_ready");
    }
  }, [academicData, isAcademicSuccess, recordLoadMilestone]);
  useEffect(() => {
    if (isLibrarySuccess && libraryData) {
      recordLoadMilestone("library_data_ready");
    }
  }, [isLibrarySuccess, libraryData, recordLoadMilestone]);

  const handleMarkerClick = useCallback(
    (id: string, facilityType: FacilityType) => {
      const facilityName = facilityData?.facilities[id]?.name;
      posthog.capture("facility_selected", {
        facility_id: id,
        facility_name: facilityName,
        facility_type: facilityType,
        selection_source: "map",
      });

      handleExternalSelectFacility(id);
    },
    [facilityData, handleExternalSelectFacility, posthog],
  );

  const showFetchingOverlay = isAcademicFetching && !isAcademicLoading;
  const mainContentClasses = `h-screen relative flex ${
    showMap ? "md:flex-row" : "items-center bg-muted/20"
  } flex-col`;

  return (
    <div
      ref={containerRef}
      className={mainContentClasses}
      style={
        showMap
          ? ({ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div
        className={`${
          showMap
            ? "h-[60vh] md:h-screen order-2 md:order-1 w-full md:w-[var(--sidebar-width)] md:min-w-[320px] md:max-w-[calc(100%-340px)] md:shrink-0 md:grow-0"
            : "h-screen max-w-3xl md:border-x border-border shadow-xs w-full flex-1"
        } overflow-hidden relative`}
      >
        <LeftSidebar
          facilityData={facilityData || null}
          expandedFacilityIds={expandedFacilityIds}
          onExpandedFacilityIdsChange={handleExpandedFacilityIdsChange}
          onExternalSelectFacility={handleExternalSelectFacility}
          scrollTargetId={scrollTarget.id}
          scrollTargetTimestamp={scrollTarget.timestamp}
          showMap={showMap}
          setShowMap={setShowMap}
          isFetching={showFetchingOverlay}
          isLibraryFetching={isLibraryFetching}
          isAcademicLoading={isAcademicLoading}
          error={error}
          onRetry={() => {
            void refetchAcademic();
          }}
        />
      </div>

      {showMap && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          title="Drag to resize (double-click to reset)"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={endResizeDrag}
          onPointerCancel={endResizeDrag}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() => commitSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          className="hidden md:flex md:absolute md:left-[var(--sidebar-width)] md:top-0 md:bottom-0 md:z-20 md:-translate-x-1/2 w-2 cursor-col-resize touch-none select-none items-stretch justify-center bg-transparent opacity-0 transition-[background-color,opacity] hover:bg-primary/15 hover:opacity-100 active:bg-primary/25 active:opacity-100 focus-visible:bg-primary/15 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
        >
          <div className="w-px bg-border" aria-hidden="true" />
        </div>
      )}

      {showMap && (
        <div className="h-[40vh] md:h-screen w-full md:w-auto md:flex-1 md:min-w-0 order-1 md:order-3">
          <Suspense fallback={<MapLoadingFallback />}>
            <FacilityMap
              facilityData={facilityData || null}
              onMarkerClick={handleMarkerClick}
              trackInitialLoad
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: IlliniSpotsPage,
});
