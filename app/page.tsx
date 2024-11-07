"use client";

import { useState, useEffect } from "react";
import LeftSidebar from "@/components/left";
import Map from "@/components/map";
import { BuildingStatus } from "@/types";

export default function IlliniSpotsPage() {
  const [buildingData, setBuildingData] = useState<BuildingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBuildings, setExpandedBuildings] = useState<string[]>([]);

  // state variable to control map visibility
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/buildings-availability");
        const data = await response.json();
        setBuildingData(data);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleMarkerClick = (buildingName: string) => {
    setExpandedBuildings((prev) =>
      prev.includes(buildingName) ? prev : [...prev, buildingName],
    );
  };

  return (
    <div className={`h-screen flex ${showMap ? "md:flex-row" : ""} flex-col`}>
      {/* Map container - Conditionally render based on showMap */}
      {showMap && (
        // 2/5 on mobile, right 3/4 on desktop
        <div className="h-[40vh] md:h-screen md:w-3/4 w-full order-1 md:order-2">
          <Map buildingData={buildingData} onMarkerClick={handleMarkerClick} />
        </div>
      )}

      {/* Sidebar container - Adjust width based on showMap */}
      <div
        className={`${
          // 3/5 on mobile, left 1/4 on desktop
          showMap ? "md:w-1/4 h-[60vh] md:h-screen" : "h-screen"
        } w-full flex-1 overflow-hidden order-2 md:order-1`}
      >
        <LeftSidebar
          buildingData={buildingData}
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
