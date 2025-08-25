"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MarkerData, MapProps, FacilityType } from "@/types";
import { formatTime } from "@/utils/format";

export default function FacilityMap({
  facilityData,
  onMarkerClick,
  onMapLoaded,
}: MapProps) {
  const handleMarkerClick = useCallback(
    (id: string, type: FacilityType) => onMarkerClick(id, type),
    [onMarkerClick],
  );

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<
    Map<string, { marker: mapboxgl.Marker; data: MarkerData }>
  >(new Map());
  const activePopupRef = useRef<mapboxgl.Popup | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    const styleUrl =
      process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL || "/map/style.json";

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (styleUrl.startsWith("mapbox://") && !token) {
      console.error(
        "Mapbox style is configured but NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is missing.",
      );
      return;
    }
    if (token) {
      mapboxgl.accessToken = token;
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: styleUrl,
      minZoom: 15.2,
      antialias: true,
    });

    map.current.on("load", () => {
      setIsMapLoaded(true);
      onMapLoaded?.();
    });

    map.current.addControl(new mapboxgl.NavigationControl());
    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
    );

    return () => {
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
      markerEl.className = "cursor-pointer";

      if (!data.isOpen) {
        markerEl.className += " h-2 w-2 rounded-full bg-gray-500 shadow-[0px_0px_4px_2px_rgba(107,114,128,0.7)]";
      } else {
        const hasAvailable = data.available > 0;
        if (hasAvailable) {
          markerEl.className += " h-2 w-2 rounded-full bg-green-400 shadow-[0px_0px_4px_2px_rgba(34,197,94,0.7)]";
        } else {
          markerEl.className += " h-2 w-2 rounded-full bg-red-500 shadow-[0px_0px_4px_2px_rgba(239,68,68,0.7)]";
        }
      }

      return markerEl;
    };

    const createPopupContent = (data: MarkerData) => `
      <div style="padding: 4px 8px;">
        <strong>${data.name}</strong><br/>
        ${data.isOpen
        ? `${data.available}/${data.total} available`
        : `CLOSED<br/><span style="font-size: 0.9em; color: #666;">${data.hours.open
          ? `Opens ${formatTime(data.hours.open)}`
          : "Not open today"
        }</span>`
      }
      </div>
    `;

    const setupMarkerInteractions = (
      markerEl: HTMLDivElement,
      data: MarkerData,
    ) => {
      markerEl.addEventListener("mouseenter", () => {
        activePopupRef.current?.remove();

        activePopupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, -10],
        })
          .setLngLat([data.coordinates.longitude, data.coordinates.latitude])
          .setHTML(createPopupContent(data))
          .addTo(map.current!);
      });

      markerEl.addEventListener("mouseleave", () => {
        activePopupRef.current?.remove();
        activePopupRef.current = null;
      });

      markerEl.addEventListener("click", (e) => {
        activePopupRef.current?.remove();
        activePopupRef.current = null;

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
    const width = mapContainer.current?.clientWidth || 0;
    const isMobile = width < 768;

    const createOrUpdateMarker = (markerKey: string, markerData: MarkerData) => {
      const existingMarker = markersRef.current.get(markerKey);
      if (existingMarker) existingMarker.marker.remove();

      const markerEl = createMarkerElement(markerData, isMobile);
      const marker = new mapboxgl.Marker({ element: markerEl })
        .setLngLat([
          markerData.coordinates.longitude,
          markerData.coordinates.latitude,
        ])
        .addTo(map.current!);

      setupMarkerInteractions(markerEl, markerData);

      markersRef.current.set(markerKey, { marker, data: markerData });
    };

    // Process facilities
    Object.values(facilityData.facilities).forEach((facility) => {
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

      if (currentMarkerKeys.has(markerKey)) {
        currentMarkerKeys.delete(markerKey);

        const existing = markersRef.current.get(markerKey);
        if (existing) {
          const hasChanged =
            existing.data.isOpen !== markerData.isOpen ||
            existing.data.available !== markerData.available ||
            existing.data.total !== markerData.total;

          if (hasChanged) createOrUpdateMarker(markerKey, markerData);
        }
      } else {
        createOrUpdateMarker(markerKey, markerData);
      }
    });

    removeUnusedMarkers(currentMarkerKeys);

    // Add/update facility label layer
    try {
      const mapRef = map.current!;
      const sourceId = "facility-points";
      const layerId = "facility-labels";

      const features = Object.values(facilityData.facilities)
        .filter((f) => f.coordinates)
        .map((f) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [f.coordinates.longitude, f.coordinates.latitude],
          },
          properties: { name: f.name },
        }));

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features,
      };

      const existingSource = mapRef.getSource(sourceId) as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (existingSource) {
        existingSource.setData(geojson as any);
      } else {
        mapRef.addSource(sourceId, { type: "geojson", data: geojson });

        const firstTextLayer = mapRef
          .getStyle()
          .layers?.find(
            (l: any) => l.type === "symbol" && l.layout && l.layout["text-field"],
          );

        mapRef.addLayer(
          {
            id: layerId,
            type: "symbol",
            source: sourceId,
            layout: {
              "text-field": ["coalesce", ["get", "name"], ["get", "Name"]],
              "text-font": [
                "literal",
                ["DIN Pro Medium", "Arial Unicode MS Regular"],
              ],
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                15, 11,
                16, 12,
                17, 13,
                18, 14,
                20, 16,
              ],
              "text-allow-overlap": false,
              "icon-allow-overlap": false,
              "text-variable-anchor": ["top", "bottom", "left", "right"],
              "text-radial-offset": 0.6,
              "text-max-width": 10,
              "text-letter-spacing": 0.02,
              "text-justify": "auto",
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#111827",
              "text-halo-width": 1.2,
              "text-halo-blur": 0.4,
              "text-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15, 1],
            },
          },
          firstTextLayer && firstTextLayer.id,
        );
      }
    } catch (e) {
      console.warn("Facility label layer setup failed:", e);
    }

    return () => {
      activePopupRef.current?.remove();
      activePopupRef.current = null;
    };
  }, [facilityData, handleMarkerClick, isMapLoaded]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
