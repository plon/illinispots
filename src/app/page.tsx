"use client";

import React, { useState, useEffect, useCallback } from "react";
import LeftSidebar from "@/components/left";
import FacilityMap from "@/components/map";
import LoadingScreen from "@/components/LoadingScreen";
import { FacilityStatus, FacilityType } from "@/types";

const IlliniSpotsPage: React.FC = () => {
  const [facilityData, setFacilityData] = useState<FacilityStatus | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/facilities");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const facilitiesData = await res.json();
        setFacilityData(facilitiesData);
        setError(null);
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load facility data");
        setDataLoading(false); // In case of error, we should stop loading
      }
    };

    fetchData();
  }, []);

  // Only hide loading screen when both data is fetched AND map is loaded
  useEffect(() => {
    if (facilityData && (mapLoaded || !showMap)) {
      setDataLoading(false);
    }
  }, [facilityData, mapLoaded, showMap]);

  // Retrieve map visibility from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedShowMap = localStorage.getItem("showMap");
      if (storedShowMap !== null) {
        setShowMap(storedShowMap === "true");
      }
    }
  }, []);

  // Persist map visibility to localStorage
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

      setExpandedItems((prevItems) => {
        if (!prevItems.includes(itemId)) {
          return [...prevItems, itemId];
        }
        return prevItems;
      });
    },
    [],
  );

  const handleMapLoaded = useCallback(() => {
    setMapLoaded(true);
  }, []);

  return (
    <>
      {dataLoading && <LoadingScreen error={error} />}

      {/* Main content - always rendered but initially hidden to allow hidden map initialization */}
      <div
        className={`h-screen flex ${showMap ? "md:flex-row" : ""} flex-col`}
        style={{ visibility: dataLoading ? "hidden" : "visible" }}
      >
        {/* Map container needs to be in DOM to load properly even if visually hidden */}
        {showMap && (
          <div className="h-[40vh] md:h-screen md:w-[63%] w-full order-1 md:order-2">
            <FacilityMap
              facilityData={facilityData}
              onMarkerClick={handleMarkerClick}
              onMapLoaded={handleMapLoaded}
            />
          </div>
        )}

        <div
          className={`${
            showMap ? "md:w-[37%] h-[60vh] md:h-screen" : "h-screen"
          } w-full flex-1 overflow-hidden order-2 md:order-1`}
        >
          <LeftSidebar
            facilityData={facilityData}
            expandedItems={expandedItems}
            setExpandedItems={setExpandedItems}
            showMap={showMap}
            setShowMap={setShowMap}
          />
        </div>
      </div>
    </>
  );
};

export default IlliniSpotsPage;
