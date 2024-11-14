"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import LeftSidebar from "@/components/left";
import Map from "@/components/map";
import LoadingScreen from "@/components/LoadingScreen";
import { BuildingStatus, APIResponse } from "@/types";
import { isLibraryOpen } from "@/utils/libraryHours";

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
        const buildingRes = await fetch("/api/buildings-availability");
        const buildingJson = await buildingRes.json();
        setBuildingData(buildingJson);

        const anyLibraryOpen = [
          "Grainger Engineering Library",
          "Funk ACES Library",
          "Main Library",
        ].some((library) => isLibraryOpen(library));

        if (anyLibraryOpen) {
          const libraryRes = await fetch("/api/libraries-availability");
          const libraryJson: APIResponse = await libraryRes.json();

          const modifiedLibraryData: APIResponse = {
            timezone: libraryJson.timezone,
            current_time: libraryJson.current_time,
            data: Object.fromEntries(
              Object.entries(libraryJson.data).map(([name, libraryData]) => [
                name,
                {
                  ...libraryData,
                  isOpen: isLibraryOpen(name),
                },
              ]),
            ),
          };

          setLibraryData(modifiedLibraryData);
        } else {
          setLibraryData(null);
        }
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

  const handleMarkerClick = useCallback((name: string, isLibrary?: boolean) => {
    const itemId = isLibrary ? `library-${name}` : `building-${name}`;
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
        <div className="h-[40vh] md:h-screen md:w-2/3 w-full order-1 md:order-2">
          <Map
            buildingData={buildingData}
            libraryData={libraryData}
            onMarkerClick={handleMarkerClick}
          />
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
