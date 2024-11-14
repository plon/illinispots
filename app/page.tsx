"use client";

import { useState, useEffect } from "react";
import LeftSidebar from "@/components/left";
import Map from "@/components/map";
import { BuildingStatus, APIResponse } from "@/types";

export default function IlliniSpotsPage() {
  const [buildingData, setBuildingData] = useState<BuildingStatus | null>(null);
  const [libraryData, setLibraryData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBuildings, setExpandedBuildings] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    const fetchBuildingData = async () => {
      try {
        const response = await fetch("/api/buildings-availability");
        const data = await response.json();
        setBuildingData(data);
      } finally {
        setLoading(false);
      }
    };

    const fetchLibraryData = async () => {
      try {
        const response = await fetch("/api/libraries-availability");
        const data = await response.json();
        setLibraryData(data);
      } finally {
        setLoading(false);
      }
    };

    fetchBuildingData();
    fetchLibraryData();
  }, []);

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

  const handleMarkerClick = (buildingName: string) => {
    setExpandedBuildings((prev) =>
      prev.includes(buildingName) ? prev : [...prev, buildingName],
    );
  };

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
          expandedBuildings={expandedBuildings}
          setExpandedBuildings={setExpandedBuildings}
          showMap={showMap}
          setShowMap={setShowMap}
        />
      </div>
    </div>
  );
}
