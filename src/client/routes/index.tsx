import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  createFileRoute,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  formatMinutesAsTime,
  getCampusDateTimeParts,
  parseTimeToMinutes,
  type CampusDateTime,
} from "@/utils/time";
import LeftSidebar from "@/components/LeftSidebar";
import type { FacilityStatus, FacilityType } from "@/types";
import {
  DateTimeProvider,
  useDateTimeContext,
} from "@/contexts/DateTimeContext";
import {
  type SpotsSearch,
  validateSpotsSearch,
} from "@/client/spotsSearch";
import {
  markFacilityOpen,
  markRoomOpen,
  markSameViewPush,
} from "@/client/spotsHistory";
import {
  recordInitialLoadMilestone,
  type InitialLoadMilestone,
} from "@/utils/loadingMetrics";
import {
  ageLiveAvailability,
  LIVE_REFRESH_INTERVAL_MS,
  shouldRefetchFacilitiesOnReconnect,
} from "@/utils/liveUpdates";
import { lookupFacility } from "@/utils/searchUtils";
import { useShowMapPreference } from "@/hooks/useShowMapPreference";
const FacilityMap = lazy(() => import("@/components/FacilityMap"));

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
      return clampSidebarWidth(parsed, window.innerWidth);
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
  if (!data.facilities) {
    data.facilities = {};
  }
  return data;
};

const IlliniSpotsPageContent: React.FC = () => {
  const posthog = usePostHog();
  const { selectedDateTime, liveNow, isCurrentDateTime } = useDateTimeContext();
  const [showMap, setShowMap] = useShowMapPreference();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const navigationState = useLocation({
    select: (location) => location.state.illiniSpotsNavigation,
  });
  const selectedFacilityId = search.facility ?? null;

  const updateSearch = useCallback(
    (updates: Partial<SpotsSearch>, replace = true) => {
      navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace,
        state: replace
          ? true
          : (prev) => ({
              ...prev,
              illiniSpotsNavigation: markSameViewPush(
                prev.illiniSpotsNavigation,
              ),
            }),
      });
    },
    [navigate],
  );

  const handleSelectFacility = useCallback(
    (
      facilityId: string | null,
      options?: { clearSearch?: boolean },
    ) => {
      if (facilityId === null) {
        if (navigationState?.facilityBackSteps) {
          router.history.go(-navigationState.facilityBackSteps);
          return;
        }
        navigate({
          search: (prev) => ({
            ...prev,
            facility: undefined,
            room: undefined,
          }),
          replace: true,
          state: (prev) => ({
            ...prev,
            illiniSpotsNavigation: undefined,
          }),
        });
        return;
      }

      const switchingFacility = selectedFacilityId !== null;
      const nextNavigationState = markFacilityOpen(
        navigationState,
        switchingFacility,
      );
      navigate({
        search: (prev) => ({
          ...prev,
          facility: facilityId || undefined,
          room: undefined,
          ...(options?.clearSearch ? { q: undefined } : {}),
        }),
        replace: switchingFacility,
        state: (prev) => ({
          ...prev,
          illiniSpotsNavigation: nextNavigationState,
        }),
      });
    },
    [navigationState, navigate, router.history, selectedFacilityId],
  );

  const handleSelectRoom = useCallback(
    (room: string | null) => {
      if (room === null) {
        if (navigationState?.roomBackSteps) {
          router.history.go(-navigationState.roomBackSteps);
          return;
        }
        navigate({
          search: (prev) => ({ ...prev, room: undefined }),
          replace: true,
          state: (prev) => ({
            ...prev,
            illiniSpotsNavigation: navigationState?.facilityBackSteps
              ? { facilityBackSteps: navigationState.facilityBackSteps }
              : undefined,
          }),
        });
        return;
      }

      const switchingRoom = search.room !== undefined;
      const nextNavigationState = markRoomOpen(
        navigationState,
        switchingRoom,
      );
      navigate({
        search: (prev) => ({ ...prev, room }),
        replace: switchingRoom,
        state: (prev) => ({
          ...prev,
          illiniSpotsNavigation: nextNavigationState,
        }),
      });
    },
    [navigationState, navigate, router.history, search.room],
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      updateSearch({ q: query || undefined });
    },
    [updateSearch],
  );

  const handleApplyNaturalSearch = useCallback(
    (dateTime: CampusDateTime, query: string) => {
      const minutes = parseTimeToMinutes(dateTime.time);
      updateSearch(
        {
          date: dateTime.date,
          time:
            minutes === null
              ? undefined
              : formatMinutesAsTime(minutes).slice(0, 5),
          q: query || undefined,
        },
        false,
      );
    },
    [updateSearch],
  );

  const handleMinDurationChange = useCallback(
    (minDuration: number | undefined) => {
      updateSearch({ minDuration });
    },
    [updateSearch],
  );

  const handleFreeUntilChange = useCallback(
    (freeUntil: string) => {
      updateSearch({ freeUntil: freeUntil || undefined });
    },
    [updateSearch],
  );

  const handleClearFilters = useCallback(() => {
    updateSearch({ minDuration: undefined, freeUntil: undefined });
  }, [updateSearch]);

  const [sidebarWidth, setSidebarWidth] = useState<number>(
    readInitialSidebarWidth,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingWidthRef = useRef(sidebarWidth);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(() =>
    typeof window === "undefined" ? undefined : window.innerWidth,
  );

  // Re-clamp the restored width whenever the container changes. The stored
  // preference is untouched; only the effective width shrinks until there
  // is room again, keeping the box, separator, and ARIA value in sync.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") {return;}
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {setContainerWidth(width);}
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const effectiveSidebarWidth = clampSidebarWidth(
    sidebarWidth,
    containerWidth,
  );

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
        startWidth: clampSidebarWidth(
          pendingWidthRef.current,
          containerRef.current?.getBoundingClientRect().width,
        ),
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
        commitSidebarWidth(effectiveSidebarWidth - step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commitSidebarWidth(effectiveSidebarWidth + step);
      } else if (event.key === "Home") {
        event.preventDefault();
        commitSidebarWidth(SIDEBAR_MIN_WIDTH);
      } else if (event.key === "End") {
        event.preventDefault();
        commitSidebarWidth(SIDEBAR_MAX_WIDTH);
      }
    },
    [commitSidebarWidth, effectiveSidebarWidth],
  );

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
      const fac = lookupFacility(facilityData?.facilities, id);
      const facilityName = fac?.name;
      posthog.capture("facility_selected", {
        facility_id: id,
        facility_name: facilityName,
        facility_type: facilityType,
        selection_source: "map",
      });

      handleSelectFacility(id);
    },
    [facilityData, handleSelectFacility, posthog],
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
          ? ({ "--sidebar-width": `${effectiveSidebarWidth}px` } as React.CSSProperties)
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
          selectedFacilityId={selectedFacilityId}
          onSelectFacility={handleSelectFacility}
          selectedRoomId={search.room ?? null}
          onSelectRoom={handleSelectRoom}
          searchQuery={search.q ?? ""}
          onSearchQueryChange={handleSearchChange}
          onApplyNaturalSearch={handleApplyNaturalSearch}
          minDuration={search.minDuration}
          onMinDurationChange={handleMinDurationChange}
          freeUntil={search.freeUntil ?? ""}
          onFreeUntilChange={handleFreeUntilChange}
          onClearFilters={handleClearFilters}
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
          aria-valuenow={effectiveSidebarWidth}
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

const IlliniSpotsPage: React.FC = () => {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const selection: CampusDateTime | null =
    search.date && search.time
      ? { date: search.date, time: `${search.time}:00` }
      : null;

  const handleSelectionChange = useCallback(
    (dateTime: CampusDateTime | null) => {
      const minutes = dateTime
        ? parseTimeToMinutes(dateTime.time)
        : null;
      navigate({
        search: (prev) => ({
          ...prev,
          date: dateTime?.date,
          time:
            minutes === null
              ? undefined
              : formatMinutesAsTime(minutes).slice(0, 5),
        }),
        state: (prev) => ({
          ...prev,
          illiniSpotsNavigation: markSameViewPush(
            prev.illiniSpotsNavigation,
          ),
        }),
      });
    },
    [navigate],
  );

  return (
    <DateTimeProvider
      selection={selection}
      onSelectionChange={handleSelectionChange}
    >
      <IlliniSpotsPageContent />
    </DateTimeProvider>
  );
};

export const Route = createFileRoute("/")({
  validateSearch: validateSpotsSearch,
  component: IlliniSpotsPage,
});
