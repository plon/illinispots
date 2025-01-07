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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Always fetch building data
        const buildingRes = await fetch("/api/buildings-availability");
        const buildingJson = await buildingRes.json();
        setBuildingData(buildingJson);

        const baseLibraryData: APIResponse = {
          timezone: "America/Chicago",
          current_time: new Date().toISOString(),
          data: {
            "Grainger Engineering Library": {
              isOpen: isLibraryOpen("Grainger Engineering Library"),
              room_count: 0,
              currently_available: 0,
              rooms: {},
            },
            "Funk ACES Library": {
              isOpen: isLibraryOpen("Funk ACES Library"),
              room_count: 0,
              currently_available: 0,
              rooms: {},
            },
            "Main Library": {
              isOpen: isLibraryOpen("Main Library"),
              room_count: 0,
              currently_available: 0,
              rooms: {},
            },
          },
        };

        // Only fetch detailed availability if any library is open
        const anyLibraryOpen = Object.values(baseLibraryData.data).some(
          (lib) => lib.isOpen,
        );

        if (anyLibraryOpen) {
          const libraryRes = await fetch("/api/libraries-availability");
          const libraryJson: APIResponse = await libraryRes.json();

          // Merge availability data with base data
          Object.entries(libraryJson.data).forEach(([name, data]) => {
            if (baseLibraryData.data[name].isOpen) {
              baseLibraryData.data[name] = {
                ...data,
                isOpen: true,
              };
            }
          });
        }

        setLibraryData(baseLibraryData);
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
        <div className="h-[40vh] md:h-screen md:w-[63%] w-full order-1 md:order-2">
          <Map
            buildingData={buildingData}
            libraryData={libraryData}
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
