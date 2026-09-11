import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  createMapLibreStyle,
  TERRAIN_SOURCE_ID,
  BASEMAP_SOURCE_ID,
  getGoogleTileUrls,
  sampleElevationProfile,
  alignCameraToSection,
  type ProfileStats,
  type ProfilePoint,
} from "@/lib/dem-terrain";
import type { BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "./BasemapSwitcher";
import TerrainControls, { type LandmarkPreset } from "./TerrainControls";
import Profile3DViewer from "./Profile3DViewer";
import type { LayerState } from "./Sidebar";
import type { AreaOfInterest } from "@/lib/aoi";
import { useGeologyGeoJSON, useProvincesGeoJSON } from "@/hooks/useGeoMoz";

interface MapLibre3DViewProps {
  province?: string | null;
  district?: string | null;
  colorBy?: string;
  layers?: LayerState;
  aoi?: AreaOfInterest;
  basemap?: BasemapType;
  onBasemapChange?: (b: BasemapType) => void;
  onProvinceClick?: (name: string) => void;
  className?: string;
}

export default function MapLibre3DView({
  province,
  district,
  colorBy = "code2006",
  layers,
  aoi,
  basemap = "hybrid",
  onBasemapChange,
  onProvinceClick,
  className = "",
}: MapLibre3DViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  // 3D Map state
  const [pitch, setPitch] = useState(45);
  const [bearing, setBearing] = useState(0);
  const [exaggeration, setExaggeration] = useState(1.5);
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [coords, setCoords] = useState<{ lat: number; lng: number; ele?: number } | null>(null);

  // Profile tool state
  const [profileModeActive, setProfileModeActive] = useState(false);
  const [profilePoints, setProfilePoints] = useState<[number, number][]>([]);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [isCalculatingProfile, setIsCalculatingProfile] = useState(false);

  const [webglError, setWebglError] = useState<string | null>(null);

  // Markers
  const markerARef = useRef<maplibregl.Marker | null>(null);
  const markerBRef = useRef<maplibregl.Marker | null>(null);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);

  // GeoJSON data
  const { data: provinceGeoJSON } = useProvincesGeoJSON();
  const { data: geologyGeoJSON } = useGeologyGeoJSON(
    province ?? null,
    district ?? null,
    colorBy,
    Boolean(layers?.geology && province)
  );

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialStyle = createMapLibreStyle(basemap);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: [35.5, -18.5],
        zoom: 5,
        pitch: 45,
        bearing: 0,
        maxPitch: 85,
        canvasContextAttributes: { antialias: true },
      });
    } catch (err: any) {
      console.warn("MapLibre GL / WebGL initialization error:", err);
      setWebglError(err?.message || "WebGL não disponível");
      return;
    }

    // Try setting globe projection if supported
    try {
      if (typeof map.setProjection === "function") {
        map.setProjection({ type: "globe" });
      }
    } catch (e) {
      console.warn("Globe projection fallback to mercator:", e);
    }

    mapInstanceRef.current = map;

    map.on("load", () => {
      // Enable 3D digital elevation model terrain
      try {
        map.setTerrain({
          source: TERRAIN_SOURCE_ID,
          exaggeration: 1.5,
        });
      } catch (err) {
        console.warn("Could not enable 3D terrain:", err);
      }

      // Add metric scale control
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

      // Setup vector/geojson source for profile lines
      if (!map.getSource("profile-line-source")) {
        map.addSource("profile-line-source", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
        map.addLayer({
          id: "profile-line-glow",
          type: "line",
          source: "profile-line-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 6,
            "line-opacity": 0.8,
          },
        });
        map.addLayer({
          id: "profile-line-core",
          type: "line",
          source: "profile-line-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#f43f5e",
            "line-width": 3,
            "line-dasharray": [2, 1],
          },
        });
      }
    });

    // Track camera movement
    const onMove = () => {
      setPitch(map.getPitch());
      setBearing(map.getBearing());
    };
    map.on("move", onMove);

    // Track mouse coordinates and elevation
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      let ele: number | undefined;
      try {
        const queried = map.queryTerrainElevation([lng, lat]);
        if (queried !== null && queried !== undefined) ele = Math.round(queried);
      } catch {}
      setCoords({ lat, lng, ele });
    };
    map.on("mousemove", onMouseMove);

    const onMouseOut = () => setCoords(null);
    map.getCanvas().addEventListener("mouseout", onMouseOut);

    return () => {
      map.off("move", onMove);
      map.off("mousemove", onMouseMove);
      map.getCanvas().removeEventListener("mouseout", onMouseOut);
      if (markerARef.current) markerARef.current.remove();
      if (markerBRef.current) markerBRef.current.remove();
      if (hoverMarkerRef.current) hoverMarkerRef.current.remove();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update basemap raster tiles when basemap changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource(BASEMAP_SOURCE_ID) as maplibregl.RasterTileSource | undefined;
    if (source && typeof (source as any).setTiles === "function") {
      (source as any).setTiles(getGoogleTileUrls(basemap));
    }
  }, [basemap]);

  // Sync Vertical Exaggeration
  const handleExaggerationChange = useCallback((newExag: number) => {
    setExaggeration(newExag);
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      map.setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration: newExag,
      });
    } catch (e) {
      console.warn("Error updating terrain exaggeration:", e);
    }
  }, []);

  // Sync Pitch Change
  const handlePitchChange = useCallback((newPitch: number) => {
    setPitch(newPitch);
    const map = mapInstanceRef.current;
    if (!map) return;
    map.easeTo({ pitch: newPitch, duration: 600 });
  }, []);

  // Reset to North
  const handleResetNorth = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.easeTo({ bearing: 0, pitch: 0, duration: 800 });
  }, []);

  // Toggle Globe / Mercator Projection
  const handleToggleProjection = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || typeof map.setProjection !== "function") return;
    const next = projection === "globe" ? "mercator" : "globe";
    setProjection(next);
    try {
      map.setProjection({ type: next });
    } catch (e) {
      console.warn("Projection switch error:", e);
    }
  }, [projection]);

  // Fly to Landmark Preset
  const handleFlyToPreset = useCallback((preset: LandmarkPreset) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo({
      center: preset.center,
      zoom: preset.zoom,
      pitch: preset.pitch,
      bearing: preset.bearing,
      essential: true,
      duration: 3500,
    });
  }, []);

  // Sync AOI / Province polygon layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Handle AOI layer
    const aoiSourceId = "aoi-3d-source";
    const aoiLayerId = "aoi-3d-line";
    if (aoi?.source !== "global" && aoi?.geometry) {
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: aoi.geometry as any,
            properties: {},
          },
        ],
      };
      if (map.getSource(aoiSourceId)) {
        (map.getSource(aoiSourceId) as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        map.addSource(aoiSourceId, { type: "geojson", data: geojson });
        map.addLayer({
          id: aoiLayerId,
          type: "line",
          source: aoiSourceId,
          paint: {
            "line-color": "#f43f5e",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
      }
    } else if (map.getSource(aoiSourceId)) {
      (map.getSource(aoiSourceId) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [aoi]);

  // Sync Geology GeoJSON into 3D Terrain
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const geoSourceId = "geology-3d-source";
    const geoFillId = "geology-3d-fill";
    const geoLineId = "geology-3d-line";

    if (layers?.geology && geologyGeoJSON && geologyGeoJSON.features && geologyGeoJSON.features.length > 0) {
      if (map.getSource(geoSourceId)) {
        (map.getSource(geoSourceId) as maplibregl.GeoJSONSource).setData(geologyGeoJSON);
      } else {
        map.addSource(geoSourceId, { type: "geojson", data: geologyGeoJSON });
        map.addLayer({
          id: geoFillId,
          type: "fill",
          source: geoSourceId,
          paint: {
            "fill-color": ["coalesce", ["get", "_color"], "#64748b"],
            "fill-opacity": 0.8,
          },
        });
        map.addLayer({
          id: geoLineId,
          type: "line",
          source: geoSourceId,
          paint: {
            "line-color": "#ffffff",
            "line-width": 0.4,
            "line-opacity": 0.9,
          },
        });
      }
    } else if (map.getSource(geoSourceId)) {
      (map.getSource(geoSourceId) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [layers?.geology, geologyGeoJSON]);

  // Sync Provinces GeoJSON into 3D
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const provSourceId = "provinces-3d-source";
    const provLineId = "provinces-3d-line";

    if (layers?.provinces && provinceGeoJSON && provinceGeoJSON.features && provinceGeoJSON.features.length > 0) {
      if (map.getSource(provSourceId)) {
        (map.getSource(provSourceId) as maplibregl.GeoJSONSource).setData(provinceGeoJSON);
      } else {
        map.addSource(provSourceId, { type: "geojson", data: provinceGeoJSON });
        map.addLayer({
          id: provLineId,
          type: "line",
          source: provSourceId,
          paint: {
            "line-color": "#0ea5e9",
            "line-width": 1.5,
            "line-opacity": 0.8,
          },
        });
      }
    } else if (map.getSource(provSourceId)) {
      (map.getSource(provSourceId) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
  }, [layers?.provinces, provinceGeoJSON]);

  // Handle Profile click interaction
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (profileModeActive) {
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.getCanvas().style.cursor = "";
    }

    function onMapClick(e: maplibregl.MapMouseEvent) {
      if (!profileModeActive) return;
      const currentMap = mapInstanceRef.current;
      if (!currentMap) return;
      const clickedLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      setProfilePoints((prev) => {
        if (prev.length === 0 || prev.length >= 2) {
          // First point (Point A)
          if (markerARef.current) markerARef.current.remove();
          if (markerBRef.current) markerBRef.current.remove();

          const elA = document.createElement("div");
          elA.className =
            "w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-lg border-2 border-white ring-2 ring-emerald-400";
          elA.innerText = "A";
          markerARef.current = new maplibregl.Marker({ element: elA })
            .setLngLat(clickedLngLat)
            .addTo(currentMap);

          setProfileStats(null);
          return [clickedLngLat];
        } else {
          // Second point (Point B)
          const pointA = prev[0];
          const pointB = clickedLngLat;

          const elB = document.createElement("div");
          elB.className =
            "w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-lg border-2 border-white ring-2 ring-rose-400";
          elB.innerText = "B";
          markerBRef.current = new maplibregl.Marker({ element: elB })
            .setLngLat(pointB)
            .addTo(currentMap);

          // Draw line on 3D map
          const lineGeoJSON: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates: [pointA, pointB],
                },
                properties: {},
              },
            ],
          };
          const source = currentMap.getSource("profile-line-source") as maplibregl.GeoJSONSource | undefined;
          if (source) source.setData(lineGeoJSON);

          // Calculate elevation stats
          setIsCalculatingProfile(true);
          setTimeout(() => {
            const stats = sampleElevationProfile(currentMap, pointA, pointB, 90);
            setProfileStats(stats);
            setIsCalculatingProfile(false);
          }, 50);

          return [pointA, pointB];
        }
      });
    }

    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [profileModeActive]);

  // Handle Chart Hover point synchronization
  const handleHoverProfilePoint = useCallback((point: ProfilePoint | null) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!point) {
      if (hoverMarkerRef.current) hoverMarkerRef.current.remove();
      return;
    }

    if (!hoverMarkerRef.current) {
      const el = document.createElement("div");
      el.className =
        "w-4 h-4 bg-amber-400 rounded-full border-2 border-white shadow-md animate-ping";
      hoverMarkerRef.current = new maplibregl.Marker({ element: el });
    }

    hoverMarkerRef.current.setLngLat([point.lng, point.lat]).addTo(map);
  }, []);

  // Clear profile line and markers
  const handleCloseProfile = useCallback(() => {
    setProfileModeActive(false);
    setProfileStats(null);
    setProfilePoints([]);
    if (markerARef.current) markerARef.current.remove();
    if (markerBRef.current) markerBRef.current.remove();
    if (hoverMarkerRef.current) hoverMarkerRef.current.remove();

    const map = mapInstanceRef.current;
    if (map) {
      const source = map.getSource("profile-line-source") as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
    }
  }, []);

  // Align camera with profile cut
  const handleAlignCamera = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || profilePoints.length < 2) return;
    alignCameraToSection(map, profilePoints[0], profilePoints[1]);
  }, [profilePoints]);

  if (webglError) {
    return (
      <div className={`flex flex-col items-center justify-center w-full h-full bg-slate-900 text-white p-6 text-center ${className}`}>
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
          <span className="text-xl">⚠️</span>
        </div>
        <h3 className="text-base font-bold text-slate-100 mb-1">Visualização 3D Indisponível</h3>
        <p className="text-xs text-slate-400 max-w-sm">
          O seu navegador ou ambiente não suporta aceleração WebGL. Use o modo <strong>2D Plano</strong> na barra superior.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* MapLibre 3D Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Basemap Switcher */}
      {onBasemapChange && (
        <BasemapSwitcher
          current={basemap}
          onChange={onBasemapChange}
          className="absolute top-4 right-4 z-[600]"
        />
      )}

      {/* 3D Terrain & Camera Controls */}
      <TerrainControls
        pitch={pitch}
        bearing={bearing}
        exaggeration={exaggeration}
        projection={projection}
        profileModeActive={profileModeActive}
        onPitchChange={handlePitchChange}
        onExaggerationChange={handleExaggerationChange}
        onResetNorth={handleResetNorth}
        onToggleProjection={handleToggleProjection}
        onToggleProfileMode={() => {
          if (profileModeActive) {
            handleCloseProfile();
          } else {
            setProfileModeActive(true);
          }
        }}
        onFlyToPreset={handleFlyToPreset}
        className="absolute top-20 right-4 z-[600]"
      />

      {/* Prompt banner when profile tool is active */}
      {profileModeActive && profilePoints.length < 2 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] bg-rose-500 text-white shadow-xl rounded-full px-5 py-2 text-xs font-semibold flex items-center gap-2 animate-bounce pointer-events-none">
          <span>
            {profilePoints.length === 0
              ? "🎯 Clique no terreno para marcar o ponto de partida (Ponto A)"
              : "🏁 Agora clique para marcar o ponto de chegada (Ponto B)"}
          </span>
        </div>
      )}

      {/* Coordinates & Elevation HUD */}
      {coords && (
        <div className="absolute bottom-6 right-4 z-[600] bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-800 shadow-sm rounded-lg px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 pointer-events-none select-none flex items-center gap-3">
          <span>
            {coords.lat >= 0 ? "+" : ""}
            {coords.lat.toFixed(5)}°, {coords.lng >= 0 ? "+" : ""}
            {coords.lng.toFixed(5)}°
          </span>
          {coords.ele !== undefined && (
            <span className="font-bold text-sky-600 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded">
              ⛰️ {coords.ele} m
            </span>
          )}
        </div>
      )}

      {/* Topographic Profile 3D Viewer Panel */}
      <Profile3DViewer
        stats={profileStats}
        isLoading={isCalculatingProfile}
        onAlignCamera={handleAlignCamera}
        onClose={handleCloseProfile}
        onHoverPoint={handleHoverProfilePoint}
      />
    </div>
  );
}
