"use client";

import { useState, useEffect } from "react";
import LeftSidebar from "@/components/left";
import Map from "@/components/map";
import { BuildingStatus } from "@/types";

export default function IlliniSpotsPage() {
  const [buildingData, setBuildingData] = useState<BuildingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBuildings, setExpandedBuildings] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/status");
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
    <div className="h-screen flex md:flex-row flex-col">
      {/* Map container - half on mobile, right 3/4 on desktop */}
      <div className="h-[50vh] md:h-screen md:w-3/4 w-full order-1 md:order-2">
        <Map buildingData={buildingData} onMarkerClick={handleMarkerClick} />
      </div>

      {/* Content container - half on mobile, left 1/4 on desktop */}
      <div className="flex-1 md:w-1/4 w-full h-[50vh] md:h-screen overflow-hidden order-2 md:order-1">
        <LeftSidebar
          buildingData={buildingData}
          loading={loading}
          expandedBuildings={expandedBuildings}
          setExpandedBuildings={setExpandedBuildings}
        />
      </div>
    </div>
  );
}
