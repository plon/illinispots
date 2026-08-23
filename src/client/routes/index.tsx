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
import { getUpdatedAccordionItems } from "@/utils/accordion";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import moment from "moment-timezone";
import LeftSidebar from "@/components/left";
import { FacilityStatus, FacilityType } from "@/types";
import { useDateTimeContext } from "@/contexts/DateTimeContext";
import { projectFacilityStatus } from "@/utils/liveAvailability";
import {
  recordInitialLoadMilestone,
  type InitialLoadMilestone,
} from "@/utils/loadingMetrics";

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
  selectedDateTime: Date,
  type: "academic" | "library",
): Promise<FacilityStatus> => {
  const dateParam = moment(selectedDateTime).format("YYYY-MM-DD");
  const timeParam = moment(selectedDateTime).format("HH:mm:ss");
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
  const { selectedDateTime, isCurrentDateTime } = useDateTimeContext();
  const [currentTime, setCurrentTime] = useState(() => new Date());
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
    queryKey: ["facilities", "academic", selectedDateTime.toISOString()],
    queryFn: () => fetchFacilityData(selectedDateTime, "academic"),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });

  const {
    data: libraryData,
    isFetching: isLibraryFetching,
    isSuccess: isLibrarySuccess,
  } = useQuery<FacilityStatus, Error>({
    queryKey: ["facilities", "library", selectedDateTime.toISOString()],
    queryFn: () => fetchFacilityData(selectedDateTime, "library"),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });

  const facilityData = useMemo<FacilityStatus | undefined>(() => {
    if (!academicData && !libraryData) {
      return undefined;
    }

    const matchingLibraryFacilities =
      !academicData ||
      !libraryData ||
      libraryData.timestamp === academicData.timestamp
        ? libraryData?.facilities || {}
        : {};

    return {
      timestamp: academicData?.timestamp || libraryData?.timestamp || "",
      facilities: {
        ...(academicData?.facilities || {}),
        ...matchingLibraryFacilities,
      },
    };
  }, [academicData, libraryData]);

  useEffect(() => {
    if (!isCurrentDateTime) return;

    const updateCurrentTime = () => setCurrentTime(new Date());
    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 30_000);
    return () => window.clearInterval(intervalId);
  }, [isCurrentDateTime]);

  const displayedFacilityData = useMemo(
    () =>
      facilityData && isCurrentDateTime
        ? projectFacilityStatus(facilityData, currentTime)
        : facilityData,
    [currentTime, facilityData, isCurrentDateTime],
  );

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
    [],
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
              facilityData={displayedFacilityData || null}
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
          facilityData={displayedFacilityData || null}
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
