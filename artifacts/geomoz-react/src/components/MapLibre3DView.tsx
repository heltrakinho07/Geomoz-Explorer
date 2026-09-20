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
  calculateSlopeDegrees,
  classifySlope,
  classifySpectralIndex,
  type ProfileStats,
  type ProfilePoint,
} from "@/lib/dem-terrain";
import type { BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "./BasemapSwitcher";
import TerrainControls, { type LandmarkPreset } from "./TerrainControls";
import {
  calculateSolarState,
  getPresetState,
  type SolarState,
  type SolarPresetKey,
} from "@/lib/solar-simulation";
import Profile3DViewer from "./Profile3DViewer";
import PixelInspectorHUD, {
  type GeologyContext,
  type AdminContext,
  type AnalysisContext,
} from "./PixelInspectorHUD";
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
  viewMode?: "2d" | "3d";
  overlayRasterUrl?: string | null;
  overlayOpacity?: number;
  overlayGeoJSON?: GeoJSON.FeatureCollection | null;
  overlayGeoJSONKey?: string;
  showProfileTool?: boolean;
  activeAnalysis?: AnalysisContext | null;
  onBasemapChange?: (b: BasemapType) => void;
  onViewModeChange?: (mode: "2d" | "3d") => void;
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
  viewMode = "3d",
  overlayRasterUrl,
  overlayOpacity = 0.85,
  overlayGeoJSON,
  overlayGeoJSONKey,
  showProfileTool = false,
  activeAnalysis,
  onBasemapChange,
  onViewModeChange,
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
  const [slope, setSlope] = useState<number | null>(null);
  const [slopeClass, setSlopeClass] = useState<string | null>(null);
  const [hoveredGeology, setHoveredGeology] = useState<GeologyContext | null>(null);
  const [hoveredAdmin, setHoveredAdmin] = useState<AdminContext | null>(null);
  const [hoveredAnalysisValue, setHoveredAnalysisValue] = useState<number | string | null>(null);

  // Solar simulation state
  const [solarState, setSolarState] = useState<SolarState>(() =>
    calculateSolarState(12, true, "noon")
  );

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

    // Track mouse coordinates, elevation, slope, and rendered features
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      let ele: number | undefined;
      let slopeDeg: number | null = null;
      let slopeClassLabel: string | null = null;

      try {
        const queried = map.queryTerrainElevation([lng, lat]);
        if (queried !== null && queried !== undefined) {
          ele = Math.round(queried);
          slopeDeg = calculateSlopeDegrees(map, lng, lat);
          if (slopeDeg !== null) {
            slopeClassLabel = classifySlope(slopeDeg);
          }
        }
      } catch {}

      // Query features under cursor (geology, study area, vector overlay)
      let hoveredGeo: GeologyContext | null = null;
      let hoveredAdmin: AdminContext | null = null;
      let hoveredAnalysisVal: string | number | null = null;

      try {
        const queryLayers: string[] = [];
        if (map.getLayer("geology-3d-fill")) queryLayers.push("geology-3d-fill");
        if (map.getLayer("provinces-3d-line")) queryLayers.push("provinces-3d-line");
        if (map.getLayer("analytical-vector-fill")) queryLayers.push("analytical-vector-fill");
        if (map.getLayer("active-study-area-fill")) queryLayers.push("active-study-area-fill");

        if (queryLayers.length > 0) {
          const features = map.queryRenderedFeatures(e.point, { layers: queryLayers });
          for (const f of features) {
            const props = (f.properties || {}) as Record<string, any>;
            if (f.layer.id === "geology-3d-fill" && !hoveredGeo) {
              hoveredGeo = {
                name: props.Legend || props.LEGEND || props.code2006,
                code: props.code2006,
                era: props.ERA,
                period: props.PERIOD,
              };
            }
            if ((f.layer.id === "provinces-3d-line" || f.layer.id === "active-study-area-fill") && !hoveredAdmin) {
              if (props.Provincia || props.PROVINCIA || props.NAME_1) {
                hoveredAdmin = {
                  province: props.Provincia || props.PROVINCIA || props.NAME_1,
                  district: props.Distrito || props.DISTRITO || props.NAME_2,
                };
              }
            }
            if (f.layer.id === "analytical-vector-fill") {
              if (props._spectralValue !== undefined) {
                hoveredAnalysisVal = Number(props._spectralValue);
              }
            }
          }
        }
      } catch {}

      setCoords({ lat, lng, ele });
      setSlope(slopeDeg);
      setSlopeClass(slopeClassLabel);
      setHoveredGeology(hoveredGeo);
      setHoveredAdmin(hoveredAdmin || (province ? { province, district: district ?? undefined } : null));
      setHoveredAnalysisValue(hoveredAnalysisVal);
    };
    map.on("mousemove", onMouseMove);

    const onMouseOut = () => {
      setCoords(null);
      setSlope(null);
      setSlopeClass(null);
      setHoveredGeology(null);
      setHoveredAdmin(null);
      setHoveredAnalysisValue(null);
    };
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

  // Sync analytical overlay raster (GEE, Sentinel-2, indexes, groundwater, flood, erosion)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const OVERLAY_SOURCE_ID = "analytical-overlay-source";
    const OVERLAY_LAYER_ID = "analytical-overlay-layer";

    const updateOverlay = () => {
      if (!map.isStyleLoaded()) return;

      if (map.getLayer(OVERLAY_LAYER_ID)) {
        try { map.removeLayer(OVERLAY_LAYER_ID); } catch {}
      }
      if (map.getSource(OVERLAY_SOURCE_ID)) {
        try { map.removeSource(OVERLAY_SOURCE_ID); } catch {}
      }

      if (!overlayRasterUrl) return;

      const tile = overlayRasterUrl.startsWith("http")
        ? overlayRasterUrl
        : `${window.location.origin}${overlayRasterUrl}`;

      map.addSource(OVERLAY_SOURCE_ID, {
        type: "raster",
        tiles: [tile],
        tileSize: 256,
      });

      // Place above google-basemap-layer and analytical-vector-fill, but below profile line
      const beforeLayerId = map.getLayer("profile-line-glow")
        ? "profile-line-glow"
        : map.getLayer("aoi-3d-line")
        ? "aoi-3d-line"
        : undefined;

      map.addLayer(
        {
          id: OVERLAY_LAYER_ID,
          type: "raster",
          source: OVERLAY_SOURCE_ID,
          paint: {
            "raster-opacity": overlayOpacity ?? 0.85,
            "raster-resampling": "linear",
          },
        },
        beforeLayerId
      );
    };

    if (map.isStyleLoaded()) {
      updateOverlay();
    } else {
      map.once("styledata", updateOverlay);
    }
  }, [overlayRasterUrl, overlayOpacity]);

  // Sync analytical vector overlay (proxy spectral GeoJSON, mineral targeting zones, etc.)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const GEOJSON_SOURCE_ID = "analytical-vector-source";
    const GEOJSON_FILL_ID = "analytical-vector-fill";
    const GEOJSON_LINE_ID = "analytical-vector-line";

    const updateVectorOverlay = () => {
      if (!map.isStyleLoaded()) return;

      if (map.getLayer(GEOJSON_LINE_ID)) {
        try { map.removeLayer(GEOJSON_LINE_ID); } catch {}
      }
      if (map.getLayer(GEOJSON_FILL_ID)) {
        try { map.removeLayer(GEOJSON_FILL_ID); } catch {}
      }
      if (map.getSource(GEOJSON_SOURCE_ID)) {
        try { map.removeSource(GEOJSON_SOURCE_ID); } catch {}
      }

      if (!overlayGeoJSON || !overlayGeoJSON.features || overlayGeoJSON.features.length === 0) {
        return;
      }

      map.addSource(GEOJSON_SOURCE_ID, {
        type: "geojson",
        data: overlayGeoJSON,
      });

      const beforeLayerId = map.getLayer("profile-line-glow")
        ? "profile-line-glow"
        : undefined;

      map.addLayer(
        {
          id: GEOJSON_FILL_ID,
          type: "fill",
          source: GEOJSON_SOURCE_ID,
          paint: {
            "fill-color": [
              "coalesce",
              ["get", "_spectralColor"],
              ["get", "_color"],
              ["get", "color"],
              "#4f46e5",
            ],
            "fill-opacity": overlayOpacity ?? 0.8,
          },
        },
        beforeLayerId
      );

      map.addLayer(
        {
          id: GEOJSON_LINE_ID,
          type: "line",
          source: GEOJSON_SOURCE_ID,
          paint: {
            "line-color": "#ffffff",
            "line-width": 0.5,
            "line-opacity": 0.4,
          },
        },
        beforeLayerId
      );
    };

    if (map.isStyleLoaded()) {
      updateVectorOverlay();
    } else {
      map.once("styledata", updateVectorOverlay);
    }
  }, [overlayGeoJSON, overlayGeoJSONKey, overlayOpacity]);

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

  // Solar simulation handlers
  const handleSolarHourChange = useCallback((hour: number) => {
    setSolarState((prev) => calculateSolarState(hour, prev.shadowEnabled));
  }, []);

  const handleSelectSolarPreset = useCallback((presetKey: SolarPresetKey) => {
    setSolarState((prev) => getPresetState(presetKey, prev.shadowEnabled));
  }, []);

  const handleToggleShadows = useCallback(() => {
    setSolarState((prev) =>
      calculateSolarState(prev.hour, !prev.shadowEnabled, prev.presetKey)
    );
  }, []);

  // Synchronize Solar Simulation: Map light, dynamic hillshade shadows, and sky colors
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const syncSolar = () => {
      if (!map.isStyleLoaded()) return;

      // 1. Native 3D Terrain Light
      try {
        map.setLight({
          anchor: "map",
          position: [1.5, solarState.azimuth, solarState.polarAngle],
          color: solarState.lightColor,
          intensity: solarState.lightIntensity,
        });
      } catch (err) {
        console.warn("Could not set map light:", err);
      }

      // 2. Dynamic 3D Hillshade Shadows
      const HILLSHADE_ID = "dem-dynamic-hillshade";
      try {
        if (!map.getLayer(HILLSHADE_ID)) {
          // Add hillshade above basemap layer, but under vectors and overlays
          const beforeLayer = map.getLayer("profile-line-glow")
            ? "profile-line-glow"
            : map.getLayer("active-study-area-fill")
            ? "active-study-area-fill"
            : map.getLayer("analytical-overlay-layer")
            ? "analytical-overlay-layer"
            : undefined;

          map.addLayer(
            {
              id: HILLSHADE_ID,
              type: "hillshade",
              source: TERRAIN_SOURCE_ID,
              paint: {
                "hillshade-illumination-direction": solarState.azimuth,
                "hillshade-illumination-anchor": "map",
                "hillshade-exaggeration": solarState.shadowEnabled
                  ? solarState.shadowExaggeration
                  : 0,
                "hillshade-shadow-color": "rgba(15, 23, 42, 0.55)",
                "hillshade-highlight-color":
                  solarState.lightIntensity > 0.5
                    ? "rgba(255, 255, 255, 0.25)"
                    : "rgba(147, 197, 253, 0.15)",
                "hillshade-accent-color": "rgba(0, 0, 0, 0.4)",
              },
            },
            beforeLayer
          );
        } else {
          map.setPaintProperty(
            HILLSHADE_ID,
            "hillshade-illumination-direction",
            solarState.azimuth
          );
          map.setPaintProperty(
            HILLSHADE_ID,
            "hillshade-exaggeration",
            solarState.shadowEnabled ? solarState.shadowExaggeration : 0
          );
          map.setPaintProperty(
            HILLSHADE_ID,
            "hillshade-highlight-color",
            solarState.lightIntensity > 0.5
              ? "rgba(255, 255, 255, 0.25)"
              : "rgba(147, 197, 253, 0.15)"
          );
        }
      } catch (err) {
        console.warn("Could not sync hillshade layer:", err);
      }

      // 3. Dynamic Atmospheric Sky & Fog
      try {
        if (typeof (map as any).setSky === "function") {
          (map as any).setSky({
            "sky-color": solarState.skyColor,
            "horizon-color": solarState.horizonColor,
            "fog-color": solarState.fogColor,
          });
        }
      } catch {}
    };

    if (map.isStyleLoaded()) {
      syncSolar();
    } else {
      map.once("styledata", syncSolar);
    }
  }, [solarState]);

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

  // Sync Active Study Area (AOI or selected Province) and auto-focus 3D camera
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const AOI_SRC = "active-study-area-source";
    const AOI_FILL = "active-study-area-fill";
    const AOI_LINE = "active-study-area-line";

    const updateStudyArea = () => {
      if (!map.isStyleLoaded()) return;

      // Extract geometry for active study area
      let feature: GeoJSON.Feature | null = null;
      let bbox: [number, number, number, number] | null = null; // [minX, minY, maxX, maxY]

      if (aoi && aoi.source !== "global" && aoi.geometry) {
        feature = {
          type: "Feature",
          geometry: aoi.geometry as any,
          properties: {},
        };
        if (aoi.bounds) {
          const [[s, w], [n, e]] = aoi.bounds;
          bbox = [w, s, e, n];
        } else if ((aoi.geometry as any)?.coordinates) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const scanCoords = (coords: any) => {
            if (typeof coords[0] === "number") {
              const [x, y] = coords;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            } else if (Array.isArray(coords)) {
              coords.forEach(scanCoords);
            }
          };
          scanCoords((aoi.geometry as any).coordinates);
          if (isFinite(minX)) {
            bbox = [minX, minY, maxX, maxY];
          }
        }
      } else if (province && provinceGeoJSON?.features) {
        const found = provinceGeoJSON.features.find((f: any) => {
          const name = f.properties?.name || f.properties?.NAME_1 || f.properties?.NAME || "";
          return name.toLowerCase() === province.toLowerCase();
        });
        if (found) {
          feature = found as GeoJSON.Feature;
          // Calculate bbox from coordinates
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const scanCoords = (coords: any) => {
            if (typeof coords[0] === "number") {
              const [x, y] = coords;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            } else if (Array.isArray(coords)) {
              coords.forEach(scanCoords);
            }
          };
          scanCoords((found.geometry as any).coordinates);
          if (isFinite(minX)) {
            bbox = [minX, minY, maxX, maxY];
          }
        }
      }

      // Update map source & layer
      if (feature) {
        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: [feature],
        };
        if (map.getSource(AOI_SRC)) {
          (map.getSource(AOI_SRC) as maplibregl.GeoJSONSource).setData(geojson);
        } else {
          map.addSource(AOI_SRC, { type: "geojson", data: geojson });
          const beforeId = map.getLayer("profile-line-glow") ? "profile-line-glow" : undefined;
          map.addLayer(
            {
              id: AOI_FILL,
              type: "fill",
              source: AOI_SRC,
              paint: {
                "fill-color": "#38bdf8",
                "fill-opacity": 0.06,
              },
            },
            beforeId
          );
          map.addLayer(
            {
              id: AOI_LINE,
              type: "line",
              source: AOI_SRC,
              paint: {
                "line-color": "#0ea5e9",
                "line-width": 2,
                "line-opacity": 0.9,
              },
            },
            beforeId
          );
        }

        // Fly camera to study area
        if (bbox) {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 60, pitch: 45, duration: 1200, maxZoom: 13 }
          );
        }
      } else {
        if (map.getSource(AOI_SRC)) {
          (map.getSource(AOI_SRC) as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: [],
          });
        }
      }
    };

    if (map.isStyleLoaded()) {
      updateStudyArea();
    } else {
      map.once("styledata", updateStudyArea);
    }
  }, [province, aoi, provinceGeoJSON]);

  // Event listener to fly directly to AOI from external triggers
  useEffect(() => {
    const handleFlyToAOI = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      if (aoi?.bounds) {
        const [[s, w], [n, e]] = aoi.bounds;
        map.fitBounds([[w, s], [e, n]], { padding: 80, pitch: 45, duration: 1500, maxZoom: 14 });
      }
    };
    window.addEventListener("geomoz_fly_to_aoi", handleFlyToAOI);
    return () => window.removeEventListener("geomoz_fly_to_aoi", handleFlyToAOI);
  }, [aoi]);

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

      {/* Google Maps Bottom-Left Layer Controller */}
      {onBasemapChange && (
        <BasemapSwitcher
          current={basemap}
          onChange={onBasemapChange}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          className="absolute bottom-6 left-4 z-[600]"
          position="bottom-left"
        />
      )}

      {/* 3D Terrain & Camera Controls */}
      <TerrainControls
        pitch={pitch}
        bearing={bearing}
        exaggeration={exaggeration}
        projection={projection}
        profileModeActive={profileModeActive}
        showProfileTool={showProfileTool}
        solarState={solarState}
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
        onSolarHourChange={handleSolarHourChange}
        onSelectSolarPreset={handleSelectSolarPreset}
        onToggleShadows={handleToggleShadows}
        className="absolute top-20 right-4 z-[600]"
      />

      {/* Prompt banner when profile tool is active */}
      {showProfileTool && profileModeActive && profilePoints.length < 2 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] bg-rose-500 text-white shadow-xl rounded-full px-5 py-2 text-xs font-semibold flex items-center gap-2 animate-bounce pointer-events-none">
          <span>
            {profilePoints.length === 0
              ? "🎯 Clique no terreno para marcar o ponto de partida (Ponto A)"
              : "🏁 Agora clique para marcar o ponto de chegada (Ponto B)"}
          </span>
        </div>
      )}

      {/* Topographic Profile 3D Viewer Panel */}
      {showProfileTool && (
        <Profile3DViewer
          stats={profileStats}
          isLoading={isCalculatingProfile}
          onAlignCamera={handleAlignCamera}
          onClose={handleCloseProfile}
          onHoverPoint={handleHoverProfilePoint}
        />
      )}
    </div>
  );
}
