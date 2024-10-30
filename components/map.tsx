"use client";
import React from "react";
import { useRef, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { BuildingStatus } from "@/types";

interface MapProps {
  buildingData: BuildingStatus | null;
  onMarkerClick: (buildingName: string) => void;
}

export default function Map({ buildingData, onMarkerClick }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  const activePopupRef = useRef<maplibregl.Popup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "map/style.json",
      center: [-88.22726, 40.106936],
      zoom: 16,
      pitch: 60,
      maxPitch: 85,
      bearing: -60,
      antialias: true,
    });

    const handleResize = () => {
      if (map.current) {
        map.current.resize();
        // Set text size based on container width
        const width = mapContainer.current?.clientWidth || 0;
        map.current.setLayoutProperty(
          "building_labels",
          "text-size",
          width < 768 ? 8 : 12,
        );
      }
    };

    // Move sky and light settings inside the load event
    map.current.on("load", () => {
      handleResize();

      // Set sky and light after map is loaded
      map.current!.setSky({
        "sky-color": "#192c4a",
        "sky-horizon-blend": 0.5,
        "horizon-color": "#fbe7b6",
        "horizon-fog-blend": 0.5,
      });
    });

    // Add resize listener
    window.addEventListener("resize", handleResize);

    // Navigation control
    map.current.addControl(new maplibregl.NavigationControl());

    // Geolocation control
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
    );

    // Cleanup function
    return () => {
      window.removeEventListener("resize", handleResize);
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  // Handle markers
  useEffect(() => {
    if (!map.current || !buildingData) return;

    // Clear existing markers and popup
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    if (activePopupRef.current) {
      activePopupRef.current.remove();
    }
    markersRef.current = {};

    // Add new markers
    Object.values(buildingData.buildings).forEach((building) => {
      const hasAvailableRooms = building.roomCounts.available > 0;
      const width = mapContainer.current?.clientWidth || 0;
      const isMobile = width < 768;

      // Create marker element
      const markerEl = document.createElement("div");
      // Adjust size based on screen width
      const markerSize = isMobile ? "11px" : "16px"; // Smaller size for mobile
      markerEl.style.width = markerSize;
      markerEl.style.height = markerSize;
      markerEl.style.borderRadius = "50%";

      // Set color based on building status and availability
      if (!building.isOpen) {
        markerEl.style.background = "#6b7280"; // gray-500 for closed buildings
        markerEl.style.boxShadow = `0 0 ${isMobile ? "6px" : "10px"} #6b7280`;
      } else {
        markerEl.style.background = hasAvailableRooms ? "#22c55e" : "#ef4444";
        markerEl.style.boxShadow = `0 0 ${isMobile ? "6px" : "10px"} ${
          hasAvailableRooms ? "#22c55e" : "#ef4444"
        }`;
      }

      markerEl.style.border = `${isMobile ? "1px" : "2px"} solid white`; // Thinner border for mobile

      // Create marker
      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat([
          building.coordinates.longitude,
          building.coordinates.latitude,
        ])
        .addTo(map.current!);

      // Add hover events
      markerEl.addEventListener("mouseenter", () => {
        // Remove any existing popup
        if (activePopupRef.current) {
          activePopupRef.current.remove();
        }

        // Create new popup
        activePopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, -10],
        })
          .setLngLat([
            building.coordinates.longitude,
            building.coordinates.latitude,
          ])
          .setHTML(
            `
            <div style="padding: 4px 8px;">
              <strong>${building.name}</strong><br/>
              ${
                !building.isOpen
                  ? "CLOSED"
                  : `${building.roomCounts.available}/${Object.keys(building.rooms).length} available`
              }
            </div>
            `,
          )
          .addTo(map.current!);
      });

      markerEl.addEventListener("mouseleave", () => {
        if (activePopupRef.current) {
          activePopupRef.current.remove();
          activePopupRef.current = null;
        }
      });

      // Add click handler for accordion
      markerEl.addEventListener("click", (e) => {
        // Remove any existing popup
        if (activePopupRef.current) {
          activePopupRef.current.remove();
          activePopupRef.current = null;
        }

        onMarkerClick(building.name);
        e.stopPropagation(); // Prevent event bubbling
      });

      markersRef.current[building.name] = marker;
    });

    // Cleanup function
    return () => {
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
    };
  }, [buildingData, onMarkerClick]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
