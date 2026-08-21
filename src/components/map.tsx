import { useRef, useEffect, useState, useCallback } from "react";
import type { FeatureCollection, Point } from "geojson";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  type ClientConfig,
  MarkerData,
  MapProps,
  FacilityType,
} from "@/types";
import { formatTime } from "@/utils/format";
import {
  recordInitialLoadMilestone,
  recordMapLoadDuration,
  type MapLoadResult,
} from "@/utils/loadingMetrics";

async function loadClientConfig(): Promise<ClientConfig> {
  const response = await fetch("/api/config");

  if (!response.ok) {
    throw new Error(`Client configuration request failed (${response.status})`);
  }

  return response.json() as Promise<ClientConfig>;
}

export default function FacilityMap({
  facilityData,
  onMarkerClick,
  trackInitialLoad,
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
  const trackInitialLoadRef = useRef(trackInitialLoad);
  const mapLoadOutcomeRecorded = useRef(false);
  const mapReadyRecorded = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const {
    data: clientConfig,
    error: clientConfigError,
    isPending: isClientConfigPending,
  } = useQuery({
    queryKey: ["client-config"],
    queryFn: loadClientConfig,
    retry: 1,
    staleTime: Infinity,
  });

  useEffect(() => {
    trackInitialLoadRef.current = trackInitialLoad;
  }, [trackInitialLoad]);

  useEffect(() => {
    if (!mapContainer.current || isClientConfigPending) return;

    const mapLoadStartedAt = performance.now();
    const recordMapOutcome = (result: MapLoadResult) => {
      if (mapLoadOutcomeRecorded.current) return;

      mapLoadOutcomeRecorded.current = true;
      recordMapLoadDuration(
        performance.now() - mapLoadStartedAt,
        result,
        trackInitialLoadRef.current,
      );
    };

    setIsMapLoaded(false);
    setMapError(null);

    const styleUrl = clientConfig?.mapbox.styleUrl;
    const token = clientConfig?.mapbox.accessToken;

    if (!styleUrl || !token) {
      console.error(
        "Mapbox style and access token are not configured.",
        clientConfigError,
      );
      recordMapOutcome("missing_configuration");
      setMapError("The map is not configured.");
      return;
    }

    mapboxgl.accessToken = token;

    try {
      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: styleUrl,
        // minZoom: 15.2,
        antialias: true,
      });
      let hasLoaded = false;

      map.current = mapInstance;

      mapInstance.on("error", (event) => {
        console.error("Mapbox failed to load:", event.error);
        if (!hasLoaded) {
          recordMapOutcome("load_error");
          setMapError("The map could not be loaded.");
        }
      });

      mapInstance.on("load", () => {
        hasLoaded = true;
        recordMapOutcome("success");
        if (trackInitialLoadRef.current && !mapReadyRecorded.current) {
          mapReadyRecorded.current = true;
          recordInitialLoadMilestone("map_ready", true);
        }
        setMapError(null);
        setIsMapLoaded(true);

        // Hide/show POI labels depending on zoom level using Mapbox Standard basemap config
        const POI_MIN_VISIBLE_ZOOM = 17; // Hide POI labels below this zoom

        const applyPoiVisibility = () => {
          const show = mapInstance.getZoom() >= POI_MIN_VISIBLE_ZOOM;
          try {
            mapInstance.setConfigProperty(
              "basemap",
              "showPointOfInterestLabels",
              show,
            );
          } catch {
            // Non-standard style or config not supported
          }
        };

        // Initialize and bind to zoom updates
        applyPoiVisibility();
        mapInstance.on("zoom", applyPoiVisibility);
      });

      mapInstance.addControl(new mapboxgl.NavigationControl());
      mapInstance.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
      );
    } catch (error) {
      console.error("Mapbox initialization failed:", error);
      recordMapOutcome("initialization_error");
      setMapError("The map could not be loaded.");
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [clientConfig, clientConfigError, isClientConfigPending]);

  useEffect(() => {
    if (!map.current || !isMapLoaded || !facilityData) return;

    if (activePopupRef.current) {
      activePopupRef.current.remove();
      activePopupRef.current = null;
    }

    const createMarkerElement = (data: MarkerData) => {
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

    const createOrUpdateMarker = (markerKey: string, markerData: MarkerData) => {
      const existingMarker = markersRef.current.get(markerKey);
      if (existingMarker) existingMarker.marker.remove();

      const markerEl = createMarkerElement(markerData);
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
          properties: {
            id: f.id,
            type: f.type,
            name: f.name,
          },
        }));

      const geojson: FeatureCollection<Point> = {
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

        // interactivity for facility labels (hover: popup, click: accordion)
        const showPopupForFeature = (feature: any) => {
          try {
            const props = feature?.properties || {};
            const id: string = props.id;
            const type: FacilityType = props.type as FacilityType;
            const key = `${type}-${id}`;
            const existing = markersRef.current.get(key)?.data;

            let data: MarkerData | null = existing || null;
            if (!data && facilityData.facilities[id]) {
              const f = facilityData.facilities[id];
              data = {
                id: f.id,
                name: f.name,
                coordinates: {
                  latitude: f.coordinates.latitude,
                  longitude: f.coordinates.longitude,
                },
                isOpen: f.isOpen,
                available: f.roomCounts.available,
                total: f.roomCounts.total,
                type: f.type,
                hours: f.hours,
              };
            }

            if (!data) return;

            const coords =
              (feature.geometry && feature.geometry.coordinates) || null;

            activePopupRef.current?.remove();
            activePopupRef.current = new mapboxgl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: [0, -10],
            })
              .setLngLat(
                coords && Array.isArray(coords) ? [coords[0], coords[1]] : [
                  data.coordinates.longitude,
                  data.coordinates.latitude,
                ],
              )
              .setHTML(createPopupContent(data))
              .addTo(mapRef);
          } catch {
            // no-op
          }
        };

        mapRef.on("mouseenter", layerId, (e: any) => {
          mapRef.getCanvas().style.cursor = "pointer";
          const feature = e.features && e.features[0];
          if (!feature) return;
          showPopupForFeature(feature);
        });

        mapRef.on("mouseleave", layerId, () => {
          mapRef.getCanvas().style.cursor = "";
          activePopupRef.current?.remove();
          activePopupRef.current = null;
        });

        mapRef.on("click", layerId, (e: any) => {
          const feature = e.features && e.features[0];
          if (!feature) return;
          const props = feature.properties || {};
          const id: string = props.id;
          const type: FacilityType = props.type as FacilityType;

          const coords =
            (feature.geometry && feature.geometry.coordinates) || null;

          activePopupRef.current?.remove();
          activePopupRef.current = null;

          if (coords && Array.isArray(coords)) {
            mapRef.flyTo({
              center: [coords[0], coords[1]],
              zoom: 17,
              duration: 1000,
              essential: true,
            });
          }

          handleMarkerClick(id, type);
        });
      }
    } catch (e) {
      console.warn("Facility label layer setup failed:", e);
    }

    return () => {
      activePopupRef.current?.remove();
      activePopupRef.current = null;
    };
  }, [facilityData, handleMarkerClick, isMapLoaded]);

  return (
    <div className="relative h-full w-full bg-background">
      <div ref={mapContainer} className="h-full w-full" />

      {!isMapLoaded && !mapError && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background"
          role="status"
          aria-live="polite"
        >
          <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-200">
            <div className="loading-bar h-full" />
          </div>
          <span className="text-sm text-muted-foreground">Loading map…</span>
        </div>
      )}

      {mapError && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6 text-center"
          role="alert"
        >
          <div>
            <p className="font-medium">Map unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{mapError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
