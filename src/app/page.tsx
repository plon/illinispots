"use client";

import React, { useState, useEffect, useCallback } from "react";
import LeftSidebar from "@/components/left";
import FacilityMap from "@/components/map";
import LoadingScreen from "@/components/LoadingScreen";
import { FacilityStatus, FacilityType } from "@/types";

const IlliniSpotsPage: React.FC = () => {
  const [facilityData, setFacilityData] = useState<FacilityStatus | null>(null);
  const [loading, setLoading] = useState(true);
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
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

      // Only update state if the item is not already expanded
      if (!expandedItems.includes(itemId)) {
        setExpandedItems((prev) => [...prev, itemId]);
      }
    },
    [expandedItems],
  );

  if (loading || error) {
    return <LoadingScreen error={error} />;
  }

  return (
    <div className={`h-screen flex ${showMap ? "md:flex-row" : ""} flex-col`}>
      {showMap && (
        <div className="h-[40vh] md:h-screen md:w-[63%] w-full order-1 md:order-2">
          <FacilityMap
            facilityData={facilityData}
            onMarkerClick={handleMarkerClick}
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
  );
};

export default IlliniSpotsPage;
