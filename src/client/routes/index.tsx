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
import { getUpdatedAccordionItems } from "@/utils/accordion";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getCampusDateTimeParts,
  type CampusDateTime,
} from "@/utils/time";
import LeftSidebar from "@/components/left";
import { FacilityStatus, FacilityType } from "@/types";
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
  const [showMapPreference, setShowMapPreference] = useState<boolean | null>(
    null,
  );
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const recordedLoadMilestones = useRef(new Set<InitialLoadMilestone>());

  const recordLoadMilestone = useCallback(
    (milestone: InitialLoadMilestone) => {
      if (
        showMapPreference === null ||
        recordedLoadMilestones.current.has(milestone)
      ) {
        return;
      }

      recordedLoadMilestones.current.add(milestone);
      recordInitialLoadMilestone(milestone, showMapPreference);
    },
    [showMapPreference],
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
        ...(currentAcademicData?.facilities || {}),
        ...matchingLibraryFacilities,
      },
    };
  }, [academicData, isCurrentDateTime, libraryData, liveNow]);

  useEffect(() => {
    if (!isCurrentDateTime) return;

    let timeoutId: number | undefined;
    let cancelled = false;

    const scheduleNextRefresh = () => {
      if (cancelled) return;

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
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
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

  useEffect(() => {
    try {
      const storedShowMap = localStorage.getItem("showMap");
      setShowMapPreference(storedShowMap === null || storedShowMap === "true");
    } catch {
      setShowMapPreference(true);
    }
  }, []);

  useEffect(() => {
    if (showMapPreference === null) return;

    try {
      localStorage.setItem("showMap", showMapPreference.toString());
    } catch {
      // Continue without persistence when browser storage is unavailable.
    }
  }, [showMapPreference]);

  const setShowMap = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (value) => {
      setShowMapPreference((currentValue) => {
        const hydratedValue = currentValue ?? true;
        return typeof value === "function" ? value(hydratedValue) : value;
      });
    },
    [],
  );

  const showMap = showMapPreference === true;

  const handleMarkerClick = useCallback(
    (id: string, facilityType: FacilityType) => {
      const facilityName = facilityData?.facilities[id]?.name;
      posthog.capture("facility_selected", {
        facility_id: id,
        facility_name: facilityName,
        facility_type: facilityType,
        selection_source: "map",
      });

      const itemId = `${
        facilityType === FacilityType.LIBRARY ? "library" : "building"
      }-${id}`;

      // Use the shared utility function to update the expanded items
      setExpandedItems((prevItems) => {
        if (prevItems.includes(itemId)) {
          return prevItems;
        }

        return getUpdatedAccordionItems(itemId, prevItems);
      });
    },
    [facilityData, posthog],
  );

  const showFetchingOverlay = isAcademicFetching && !isAcademicLoading;
  const mainContentClasses = `h-screen flex ${
    showMap ? "md:flex-row" : ""
  } flex-col`;

  return (
    <div className={mainContentClasses}>
      {showMap && (
        <div className="h-[40vh] md:h-screen md:w-[63%] w-full order-1 md:order-2">
          <Suspense fallback={<MapLoadingFallback />}>
            <FacilityMap
              facilityData={facilityData || null}
              onMarkerClick={handleMarkerClick}
              trackInitialLoad={true}
            />
          </Suspense>
        </div>
      )}

      <div
        className={`${
          showMap ? "md:w-[37%] h-[60vh] md:h-screen" : "h-screen"
        } w-full flex-1 overflow-hidden order-2 md:order-1 relative`}
      >
        <LeftSidebar
          facilityData={facilityData || null}
          expandedItems={expandedItems}
          setExpandedItems={setExpandedItems}
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
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: IlliniSpotsPage,
});
