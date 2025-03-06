"use client";
import React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { MarkerData, MapProps, FacilityType } from "@/types";

export default function Map({
  facilityData,
  onMarkerClick,
}: MapProps) {
  // Use useCallback to prevent unnecessary rerenders
  const handleMarkerClick = useCallback(
    (id: string, type: FacilityType) => {
      onMarkerClick(id, type);
    },
    [onMarkerClick]
  );
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: maplibregl.Marker }>({});
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "/map/style.json",
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
  }, []);

  useEffect(() => {
    if (!map.current || !isMapLoaded || !facilityData) return;

    Object.values(markersRef.current).forEach((marker) => marker.remove());
    if (activePopupRef.current) {
      activePopupRef.current.remove();
    }
    markersRef.current = {};

    const markerDataArray: MarkerData[] = [];

    // Process all facilities (both academic buildings and libraries)
    Object.values(facilityData.facilities).forEach((facility) => {
      markerDataArray.push({
        id: facility.id,
        name: facility.name,
        coordinates: [
          facility.coordinates.longitude,
          facility.coordinates.latitude,
        ],
        isOpen: facility.isOpen,
        available: facility.roomCounts.available,
        total: facility.roomCounts.total,
        type: facility.type,
      });
    });

    const width = mapContainer.current?.clientWidth || 0;
    const isMobile = width < 768;

    markerDataArray.forEach((data) => {
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

      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat(data.coordinates)
        .addTo(map.current!);

      markerEl.addEventListener("mouseenter", () => {
        if (activePopupRef.current) {
          activePopupRef.current.remove();
        }

        activePopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, -10],
        })
          .setLngLat(data.coordinates)
          .setHTML(
            `
            <div style="padding: 4px 8px;">
              <strong>${data.name}</strong><br/>
              ${!data.isOpen ? "CLOSED" : `${data.available}/${data.total} available`}
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

      markerEl.addEventListener("click", (e) => {
        if (activePopupRef.current) {
          activePopupRef.current.remove();
          activePopupRef.current = null;
        }

        map.current?.flyTo({
          center: data.coordinates,
          zoom: 17,
          duration: 1000,
          essential: true,
        });

        handleMarkerClick(data.id, data.type);
        e.stopPropagation();
      });

      markersRef.current[data.id] = marker;
    });

    return () => {
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
    };
  }, [facilityData, handleMarkerClick, isMapLoaded]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
