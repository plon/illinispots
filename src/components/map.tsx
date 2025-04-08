"use client";
import React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { MarkerData, MapProps, FacilityType } from "@/types";
import { formatTime } from "@/utils/format";

export default function FacilityMap({
  facilityData,
  onMarkerClick,
  onMapLoaded,
}: MapProps) {
  const handleMarkerClick = useCallback(
    (id: string, type: FacilityType) => {
      onMarkerClick(id, type);
    },
    [onMarkerClick],
  );

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<
    Map<string, { marker: maplibregl.Marker; data: MarkerData }>
  >(new Map());
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapContainerEl = mapContainer.current;
    map.current = new maplibregl.Map({
      container: mapContainerEl,
      style: "/map/style.json",
      center: [-88.22726, 40.106936],
      zoom: 16,
      pitch: 60,
      maxPitch: 85,
      bearing: -60,
      antialias: true,
      minZoom: 15.2,
    });

    const handleResize = () => {
      if (map.current) {
        map.current.resize();
        const width = mapContainer.current?.clientWidth || 0;
        map.current.setLayoutProperty(
          "building_labels",
          "text-size",
          width < 768 ? 8 : 12,
        );
      }
    };

    map.current.on("load", () => {
      setIsMapLoaded(true);
      if (onMapLoaded) {
        onMapLoaded();
      }
      handleResize();
      map.current!.setSky({
        "sky-color": "#192c4a",
        "sky-horizon-blend": 0.5,
        "horizon-color": "#fbe7b6",
        "horizon-fog-blend": 0.5,
      });
    });

    window.addEventListener("resize", handleResize);

    map.current.addControl(new maplibregl.NavigationControl());
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
    );

    return () => {
      window.removeEventListener("resize", handleResize);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [onMapLoaded]);

  useEffect(() => {
    if (!map.current || !isMapLoaded || !facilityData) return;

    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }

    const createMarkerElement = (data: MarkerData, isMobile: boolean) => {
      const markerEl = document.createElement("div");
      const markerSize = isMobile ? "11px" : "16px";
      markerEl.style.width = markerSize;
      markerEl.style.height = markerSize;
      markerEl.style.borderRadius = "50%";
      markerEl.style.cursor = "pointer";

      if (!data.isOpen) {
        markerEl.style.background = "#6b7280";
        markerEl.style.boxShadow = `0 0 ${isMobile ? "6px" : "10px"} #6b7280`;
      } else {
        const hasAvailable = data.available > 0;
        markerEl.style.background = hasAvailable ? "#22c55e" : "#ef4444";
        markerEl.style.boxShadow = `0 0 ${isMobile ? "6px" : "10px"} ${
          hasAvailable ? "#22c55e" : "#ef4444"
        }`;
      }

      markerEl.style.border = `${isMobile ? "1px" : "2px"} solid white`;
      return markerEl;
    };

    const createPopupContent = (data: MarkerData) => {
      return `
        <div style="padding: 4px 8px;">
          <strong>${data.name}</strong><br/>
          ${
            data.isOpen
              ? `${data.available}/${data.total} available`
              : `CLOSED<br/><span style="font-size: 0.9em; color: #666;">${
                  data.hours.open
                    ? `Opens ${formatTime(data.hours.open)}`
                    : "Not open today"
                }</span>`
          }
        </div>
      `;
    };

    const setupMarkerInteractions = (
      markerEl: HTMLDivElement,
      marker: maplibregl.Marker,
      data: MarkerData,
    ) => {
      markerEl.addEventListener("mouseenter", () => {
        if (activePopupRef.current) {
          activePopupRef.current.remove();
        }

        activePopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, -10],
        })
          .setLngLat([data.coordinates.longitude, data.coordinates.latitude])
          .setHTML(createPopupContent(data))
          .addTo(map.current!);
      });

      markerEl.addEventListener("mouseleave", () => {
        if (activePopupRef.current) {
          activePopupRef.current.remove();
          activePopupRef.current = null;
        }
      });

      markerEl.addEventListener("click", (e) => {
        if (activePopupRef.current) {
          activePopupRef.current.remove();
          activePopupRef.current = null;
        }

        map.current?.flyTo({
          center: [data.coordinates.longitude, data.coordinates.latitude],
          zoom: 17,
          duration: 1000,
          essential: true,
        });

        handleMarkerClick(data.id, data.type);
        e.stopPropagation();
      });
    };

    const removeUnusedMarkers = (keysToRemove: Set<string>) => {
      keysToRemove.forEach((keyToRemove) => {
        const markerData = markersRef.current.get(keyToRemove);
        if (markerData) {
          markerData.marker.remove();
          markersRef.current.delete(keyToRemove);
        }
      });
    };

    const currentMarkerKeys = new Set(markersRef.current.keys());
    const newMarkerDataMap: { [key: string]: MarkerData } = {};
    const width = mapContainer.current?.clientWidth || 0;
    const isMobile = width < 768;

    // Helper function to create or update markers
    const createOrUpdateMarker = (
      markerKey: string,
      markerData: MarkerData,
    ) => {
      // Remove existing marker if it exists
      const existingMarker = markersRef.current.get(markerKey);
      if (existingMarker) {
        existingMarker.marker.remove();
      }

      // Create new marker element and marker
      const markerEl = createMarkerElement(markerData, isMobile);
      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat([
          markerData.coordinates.longitude,
          markerData.coordinates.latitude,
        ])
        .addTo(map.current!);

      // Set up interactions
      setupMarkerInteractions(markerEl, marker, markerData);

      // Update reference
      markersRef.current.set(markerKey, {
        marker,
        data: markerData,
      });
    };

    // Process all facilities
    Object.values(facilityData.facilities).forEach((facility) => {
      // Skip facilities with missing required data
      if (!facility.coordinates || !facility.roomCounts) {
        console.warn(`Facility ${facility.id} is missing required properties`);
        return;
      }

      const markerData: MarkerData = {
        id: facility.id,
        name: facility.name,
        coordinates: {
          latitude: facility.coordinates.latitude,
          longitude: facility.coordinates.longitude,
        },
        isOpen: facility.isOpen,
        available: facility.roomCounts.available,
        total: facility.roomCounts.total,
        type: facility.type,
        hours: facility.hours,
      };

      const markerKey = `${facility.type}-${facility.id}`;
      newMarkerDataMap[markerKey] = markerData;

      // If marker exists, check if it needs updating
      if (currentMarkerKeys.has(markerKey)) {
        currentMarkerKeys.delete(markerKey); // Remove from keys to delete

        const existingMarkerData = markersRef.current.get(markerKey);
        if (existingMarkerData) {
          const hasChanged =
            existingMarkerData.data.isOpen !== markerData.isOpen ||
            existingMarkerData.data.available !== markerData.available ||
            existingMarkerData.data.total !== markerData.total;

          if (hasChanged) {
            createOrUpdateMarker(markerKey, markerData);
          }
        }
      } else {
        createOrUpdateMarker(markerKey, markerData);
      }
    });

    removeUnusedMarkers(currentMarkerKeys);

    return () => {
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
    };
  }, [facilityData, handleMarkerClick, isMapLoaded]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
