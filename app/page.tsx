"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import LeftSidebar from "@/components/left";
import Map from "@/components/map";
import { BuildingStatus, APIResponse } from "@/types";

const IlliniSpotsPage: React.FC = () => {
  const [buildingData, setBuildingData] = useState<BuildingStatus | null>(null);
  const [libraryData, setLibraryData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Fetch building and library data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [buildingRes, libraryRes] = await Promise.all([
          fetch("/api/buildings-availability"),
          fetch("/api/libraries-availability"),
        ]);

        const [buildingJson, libraryJson] = await Promise.all([
          buildingRes.json(),
          libraryRes.json(),
        ]);

        setBuildingData(buildingJson);
        setLibraryData(libraryJson);
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

  const handleMarkerClick = useCallback((buildingName: string) => {
    const buildingItem = `building-${buildingName}`;
    setExpandedItems((prev) => {
      if (!prev.includes(buildingItem)) {
        return [...prev, buildingItem];
      }
      return prev;
    });
  }, []);

  return (
    <div className={`h-screen flex ${showMap ? "md:flex-row" : ""} flex-col`}>
      {showMap && (
        <div className="h-[40vh] md:h-screen md:w-2/3 w-full order-1 md:order-2">
          <Map buildingData={buildingData} onMarkerClick={handleMarkerClick} />
        </div>
      )}

      <div
        className={`${
          showMap ? "md:w-1/3 h-[60vh] md:h-screen" : "h-screen"
        } w-full flex-1 overflow-hidden order-2 md:order-1`}
      >
        <LeftSidebar
          buildingData={buildingData}
          libraryData={libraryData}
          loading={loading}
          expandedItems={expandedItems}
          setExpandedItems={setExpandedItems}
          showMap={showMap}
          setShowMap={setShowMap}
        />
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default memo(IlliniSpotsPage);
