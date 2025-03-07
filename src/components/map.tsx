"use client";
import React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { MarkerData, MapProps, FacilityType } from "@/types";
import { formatTime } from "@/utils/format";

export default function FacilityMap({ facilityData, onMarkerClick }: MapProps) {
  const handleMarkerClick = useCallback(
    (id: string, type: FacilityType) => {
      onMarkerClick(id, type);
    },
    [onMarkerClick],
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

    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }

    const markerDataMap = new Map<string, MarkerData>();

    // Process all facilities into a map with a unique key
    Object.values(facilityData.facilities).forEach((facility) => {
      // Skip facilities with missing required data
      if (!facility.coordinates || !facility.roomCounts) {
        console.warn(`Facility ${facility.id} is missing required properties`);
        return;
      }

      const markerKey = `${facility.type}-${facility.id}`;
      markerDataMap.set(markerKey, {
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
      });
    });

    const width = mapContainer.current?.clientWidth || 0;
    const isMobile = width < 768;

    // Remove markers that don't exist in the new data
    Object.keys(markersRef.current).forEach((key) => {
      if (!markerDataMap.has(key)) {
        markersRef.current[key].remove();
        delete markersRef.current[key];
      }
    });

    // Update existing markers or create new ones
    markerDataMap.forEach((data, key) => {
      const markerSize = isMobile ? "11px" : "16px";

      // Update existing marker
      if (markersRef.current[key]) {
        const markerEl = markersRef.current[key].getElement();

        // Update marker style based on new data
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

        // Update marker position if needed
        const currentLngLat = markersRef.current[key].getLngLat();
        const newLng = data.coordinates.longitude;
        const newLat = data.coordinates.latitude;
        if (currentLngLat.lng !== newLng || currentLngLat.lat !== newLat) {
          markersRef.current[key].setLngLat({ lng: newLng, lat: newLat });
        }
      }
      // Create new marker
      else {
        const markerEl = document.createElement("div");
        markerEl.style.width = markerSize;
        markerEl.style.height = markerSize;
        markerEl.style.borderRadius = "50%";
        markerEl.style.cursor = "pointer";
        markerEl.style.border = `${isMobile ? "1px" : "2px"} solid white`;

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

        const marker = new maplibregl.Marker({ element: markerEl })
          .setLngLat({
            lng: data.coordinates.longitude,
            lat: data.coordinates.latitude,
          })
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
            .setLngLat({
              lng: data.coordinates.longitude,
              lat: data.coordinates.latitude,
            })
            .setHTML(
              `
              <div style="padding: 4px 8px;">
                <strong>${data.name}</strong><br/>
                ${
                  data.isOpen
                    ? `${data.available}/${data.total} available`
                    : `CLOSED<br/><span style="font-size: 0.9em; color: #666;">Opens ${formatTime(data.hours.open)}</span>`
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

        markerEl.addEventListener("click", (e) => {
          if (activePopupRef.current) {
            activePopupRef.current.remove();
            activePopupRef.current = null;
          }

          map.current?.flyTo({
            center: {
              lng: data.coordinates.longitude,
              lat: data.coordinates.latitude,
            },
            zoom: 17,
            duration: 1000,
            essential: true,
          });

          handleMarkerClick(data.id, data.type);
          e.stopPropagation();
        });

        markersRef.current[key] = marker;
      }
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
