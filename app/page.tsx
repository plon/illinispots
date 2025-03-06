"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import LeftSidebar from "@/components/left";
import Map from "@/components/map";
import LoadingScreen from "@/components/LoadingScreen";
import { BuildingStatus, FacilityType, APIResponse, Facility } from "@/types";
import { isLibraryOpen } from "@/utils/libraryHours";

// Define a type for the building data from API
interface BuildingData {
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  hours: {
    open: string;
    close: string;
  };
  rooms: Record<string, {
    status: "available" | "occupied";
    available: boolean;
    currentClass?: {
      course: string;
      title: string;
      time: {
        start: string;
        end: string;
      };
    };
    nextClass?: {
      course: string;
      title: string;
      time: {
        start: string;
        end: string;
      };
    };
    passingPeriod: boolean;
    availableAt?: string;
    availableFor?: number;
    availableUntil?: string;
  }>;
  isOpen: boolean;
  roomCounts: {
    available: number;
    total: number;
  };
}

const IlliniSpotsPage: React.FC = () => {
  const [facilityData, setFacilityData] = useState<BuildingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch building data
        const buildingRes = await fetch("/api/buildings-availability");
        const buildingJson = await buildingRes.json();

        // Create a new facilityData object with the unified structure
        const facilitiesData: BuildingStatus = {
          timestamp: buildingJson.timestamp,
          facilities: {}
        };

        // Convert academic buildings to Facility type
        Object.entries(buildingJson.buildings).forEach(([id, buildingData]) => {
          const building = buildingData as BuildingData;
          facilitiesData.facilities[id] = {
            id,
            name: building.name,
            type: FacilityType.ACADEMIC,
            coordinates: building.coordinates,
            hours: building.hours,
            rooms: building.rooms,
            isOpen: building.isOpen,
            roomCounts: building.roomCounts
          };
        });

        // Initialize library facilities
        const libraryFacilities: { [key: string]: Facility } = {
          "Grainger Engineering Library": {
            id: "grainger",
            name: "Grainger Engineering Library",
            type: FacilityType.LIBRARY,
            coordinates: {
              latitude: 40.11247372608236,
              longitude: -88.2268586691797
            },
            hours: { open: "", close: "" },
            rooms: {},
            isOpen: isLibraryOpen("Grainger Engineering Library"),
            roomCounts: { available: 0, total: 0 }
          },
          "Funk ACES Library": {
            id: "aces",
            name: "Funk ACES Library",
            type: FacilityType.LIBRARY,
            coordinates: {
              latitude: 40.102836655077226,
              longitude: -88.22513280595481
            },
            hours: { open: "", close: "" },
            rooms: {},
            isOpen: isLibraryOpen("Funk ACES Library"),
            roomCounts: { available: 0, total: 0 }
          },
          "Main Library": {
            id: "main",
            name: "Main Library",
            type: FacilityType.LIBRARY,
            coordinates: {
              latitude: 40.1047194114613,
              longitude: -88.22883490200387
            },
            hours: { open: "", close: "" },
            rooms: {},
            isOpen: isLibraryOpen("Main Library"),
            roomCounts: { available: 0, total: 0 }
          },
        };

        // Only fetch detailed library availability if any library is open
        const anyLibraryOpen = Object.values(libraryFacilities).some(
          (lib) => lib.isOpen
        );

        if (anyLibraryOpen) {
          const libraryRes = await fetch("/api/libraries-availability");
          const libraryJson: APIResponse = await libraryRes.json();

          // Convert library room data to FacilityRoom format
          Object.entries(libraryJson.data).forEach(([name, data]) => {
            if (libraryFacilities[name] && libraryFacilities[name].isOpen) {
              const libraryFacility = libraryFacilities[name];
              
              // Set room counts
              libraryFacility.roomCounts = {
                available: data.currently_available,
                total: data.room_count
              };
              
              // Convert library rooms to FacilityRoom format
              Object.entries(data.rooms).forEach(([roomName, roomData]) => {
                const isAvailable = roomData.slots.some(slot => {
                  const now = new Date().toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'America/Chicago'
                  });
                  return slot.available && slot.start <= now && now < slot.end;
                });
                
                libraryFacility.rooms[roomName] = {
                  status: isAvailable ? "available" : "reserved",
                  available: isAvailable,
                  url: roomData.url,
                  thumbnail: roomData.thumbnail,
                  slots: roomData.slots,
                  nextAvailable: roomData.nextAvailable,
                  availableFor: roomData.available_duration
                };
              });
            }
          });
        }

        // Add library facilities to facilitiesData
        Object.values(libraryFacilities).forEach(facility => {
          facilitiesData.facilities[facility.id] = facility;
        });

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
          <Map
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
