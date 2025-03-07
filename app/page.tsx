"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import LeftSidebar from "@/components/left";
import FacilityMap from "@/components/map";
import LoadingScreen from "@/components/LoadingScreen";
import { FacilityStatus, FacilityType } from "@/types";

const IlliniSpotsPage: React.FC = () => {
  const [facilityData, setFacilityData] = useState<FacilityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Let the API handle which libraries to include based on their open hours
        const res = await fetch("/api/facilities");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const facilitiesData = await res.json();
        
        setFacilityData(facilitiesData);
      } catch (error) {
        console.error("Error fetching data:", error);
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

  const handleMarkerClick = useCallback((id: string, facilityType: FacilityType) => {
    const itemId = `${facilityType === FacilityType.LIBRARY ? 'library' : 'building'}-${id}`;
    setExpandedItems((prev) => {
      if (!prev.includes(itemId)) {
        return [...prev, itemId];
      }
      return prev;
    });
  }, []);

  if (loading) {
    return <LoadingScreen />;
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

export default memo(IlliniSpotsPage);
