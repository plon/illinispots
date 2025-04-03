"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getUpdatedAccordionItems } from "@/utils/accordion";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import moment from "moment-timezone";
import LeftSidebar from "@/components/left";
import FacilityMap from "@/components/map";
import LoadingScreen from "@/components/LoadingScreen";
import { FacilityStatus, FacilityType } from "@/types";
import { useDateTimeContext } from "@/contexts/DateTimeContext";

const fetchFacilityData = async (
  selectedDateTime: Date,
): Promise<FacilityStatus> => {
  const dateParam = moment(selectedDateTime).format("YYYY-MM-DD");
  const timeParam = moment(selectedDateTime).format("HH:mm:ss");
  const apiUrl = `/api/facilities?date=${dateParam}&time=${timeParam}`;

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
  const { selectedDateTime } = useDateTimeContext();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const {
    data: facilityData,
    isLoading,
    isFetching, // <-- Get isFetching state
    error: queryError,
    isSuccess,
  } = useQuery<FacilityStatus, Error>({
    queryKey: ["facilities", selectedDateTime.toISOString()],
    queryFn: () => fetchFacilityData(selectedDateTime),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });

  const error = queryError ? queryError.message : null;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedShowMap = localStorage.getItem("showMap");
      if (storedShowMap !== null) {
        setShowMap(storedShowMap === "true");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("showMap", showMap.toString());
    }
  }, [showMap]);

  const handleMarkerClick = useCallback(
    (id: string, facilityType: FacilityType) => {
      const itemId = `${
        facilityType === FacilityType.LIBRARY ? "library" : "building"
      }-${id}`;

      // Use the shared utility function to update the expanded items
      setExpandedItems((prevItems) => {
        // If already open, don't change anything (unlike toggleItem which would close it)
        if (prevItems.includes(itemId)) {
          return prevItems;
        }

        return getUpdatedAccordionItems(itemId, prevItems);
      });
    },
    [],
  );

  const handleMapLoaded = useCallback(() => {
    setMapLoaded(true);
  }, []);

  const isDataReady = !isLoading && isSuccess && !!facilityData && !error;
  const isMapReady = !showMap || mapLoaded;
  const isUIReady = isDataReady && isMapReady;
  const displayLoadingScreen = !isUIReady && isLoading; // Show initial loading screen only when isLoading
  const loadingScreenError = error && !isLoading ? error : null;

  // Determine if the sidebar should show a fetching state (dimming)
  // Show fetching overlay if it's fetching but NOT the initial load
  const showFetchingOverlay = isFetching && !isLoading;

  return (
    <>
      {displayLoadingScreen && <LoadingScreen error={loadingScreenError} />}

      <div
        className={`h-screen flex ${showMap ? "md:flex-row" : ""} flex-col`}
        style={{ visibility: isUIReady || isFetching ? "visible" : "hidden" }} // Keep visible during fetching too
      >
        {showMap && (
          <div className="h-[40vh] md:h-screen md:w-[63%] w-full order-1 md:order-2">
            <FacilityMap
              facilityData={isDataReady ? facilityData : null}
              onMarkerClick={handleMarkerClick}
              onMapLoaded={handleMapLoaded}
            />
          </div>
        )}

        <div
          className={`${
            showMap ? "md:w-[37%] h-[60vh] md:h-screen" : "h-screen"
          } w-full flex-1 overflow-hidden order-2 md:order-1 relative`} // Added relative positioning
        >
          <LeftSidebar
            facilityData={isDataReady ? facilityData : null}
            expandedItems={expandedItems}
            setExpandedItems={setExpandedItems}
            showMap={showMap}
            setShowMap={setShowMap}
            isFetching={showFetchingOverlay} // Pass fetching state for dimming
          />
        </div>
      </div>
    </>
  );
};

export default IlliniSpotsPage;
