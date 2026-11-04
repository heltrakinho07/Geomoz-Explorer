/**
 * Real-world DEM positioning within the native GeoMoz GIS Workspace.
 * MapLibre drapes selected basemap tiles over the DEM's own elevation grid,
 * resampled on demand from project memory (never uploaded to another service).
 */
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import proj4 from "proj4";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";
import type { GeoMozTerrainOverlay } from "./geomoz-terrain-overlays";
import {
  terrainProjection, terrainRecommendedMaxZoom, terrainTerrariumPng, validTerrainGeography,
} from "./geomoz-terrain-tiles";

type Basemap = "satellite" | "topographic" | "streets";
type Elevation = "local" | "global";
interface Props {
  terrain: TerrainMeshData;
  overlays: GeoMozTerrainOverlay[];
  exaggeration: number;
  /** Split view uses a north-up, truly flat overview alongside the local 3D canvas. */
  flat?: boolean;
  translate?: (value: string) => string;
}
const BASEMAPS: Record<Basemap, { label: string; url: string; attribution: string }> = {
  satellite: {
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  },
  topographic: {
    label: "Topográfico",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri and contributors",
  },
  streets: {
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
};
const BASE_ID = "geomoz-local-basemap";
const LOCAL_DEM = "geomoz-local-raster-dem";
const GLOBAL_DEM = "geomoz-global-raster-dem";
const FOOTPRINT_ID = "geomoz-dem-footprint";
const VECTOR_PREFIX = "geomoz-draped-layer-";

function makeStyle(which: Basemap): maplibregl.StyleSpecification {
  return {
    version: 8,
    name: "GeoMoz · DEM geográfico",
    sources: {
      [BASE_ID]: {
        type: "raster", tiles: [BASEMAPS[which].url],
        tileSize: 256, maxzoom: 19, attribution: BASEMAPS[which].attribution,
      },
    },
    layers: [{ id: "geomoz-geographic-basemap", type: "raster", source: BASE_ID }],
  };
}

function footprint(terrain: TerrainMeshData): GeoJSON.FeatureCollection {
  const [left, bottom, right, top] = terrain.boundsMeters;
  const ring: number[][] = [];
  // Densified projected rectangle: UTM edges are not exact WGS84 rectangles.
  const corners: [number, number][] = [
    [left, bottom], [right, bottom], [right, top], [left, top], [left, bottom],
  ];
  for (let k = 0; k < 4; k++) for (let n = 0; n < 12; n++) {
    const f = n / 12;
    const xy: [number, number] = [
      corners[k][0] * (1 - f) + corners[k + 1][0] * f,
      corners[k][1] * (1 - f) + corners[k + 1][1] * f,
    ];
    ring.push(proj4(terrain.crs, "EPSG:4326", xy));
  }
  ring.push(ring[0]);
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: terrain.name },
      geometry: { type: "Polygon", coordinates: [ring] },
    }],
  };
}

function colourPaint(overlay: GeoMozTerrainOverlay): string | maplibregl.ExpressionSpecification {
  if (overlay.mode !== "categorized" || !overlay.field) return overlay.color;
  const pairs = Object.entries(overlay.categories).slice(0, 64).flatMap(([category, color]) => [category, color]);
  return ["match", ["to-string", ["get", overlay.field]], ...pairs, overlay.color] as maplibregl.ExpressionSpecification;
}

function syncGeoOverlays(map: maplibregl.Map, overlays: GeoMozTerrainOverlay[]) {
  const style = map.getStyle();
  for (const layer of [...(style.layers ?? [])]) {
    if (layer.id.startsWith(VECTOR_PREFIX)) map.removeLayer(layer.id);
  }
  for (const id of Object.keys(style.sources ?? {})) {
    if (id.startsWith(VECTOR_PREFIX)) map.removeSource(id);
  }
  // The actual WGS84 GeoJSON layers stay in the GIS project; this is only a
  // temporary map rendering of the same editable styles and visibility.
  for (let i = 0; i < overlays.length; i++) {
    const overlay = overlays[i];
    if (!overlay.visible || overlay.opacity <= 0) continue;
    const id = VECTOR_PREFIX + i;
    map.addSource(id, { type: "geojson", data: overlay.geojson });
    const color = colourPaint(overlay);
    map.addLayer({
      id: id + "-fill", type: "fill", source: id,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": color, "fill-opacity": Math.min(1, overlay.opacity * 0.55) },
    });
    map.addLayer({
      id: id + "-line", type: "line", source: id,
      paint: { "line-color": overlay.stroke, "line-width": 2.2,
        "line-opacity": overlay.opacity },
    });
    map.addLayer({
      id: id + "-point", type: "circle", source: id,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 5, "circle-color": color,
        "circle-opacity": overlay.opacity, "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff" },
    });
  }
}

export default function GeoMozTerrainGeoMap({
  terrain, overlays, exaggeration, flat = false, translate = (value) => value,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlaysRef = useRef(overlays);
  const elevationRef = useRef<Elevation>("local");
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [elevation, setElevation] = useState<Elevation>("local");
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isValid = validTerrainGeography(terrain);
  overlaysRef.current = overlays;
  elevationRef.current = elevation;

  useEffect(() => {
    if (!container.current || !isValid) return;
    const protocol = "geomozdem" + Math.random().toString(36).slice(2, 12);
    let map: maplibregl.Map | null = null;
    let resize: ResizeObserver | null = null;
    try {
      const project = terrainProjection(terrain);
      maplibregl.addProtocol(protocol, async ({ url }) => {
        const match = /(\d+)\/(\d+)\/(\d+)\.png(?:\?.*)?$/.exec(url);
        if (!match) throw Error("Tile DEM inválido.");
        return {
          data: await terrainTerrariumPng(terrain, project,
            Number(match[1]), Number(match[2]), Number(match[3])),
        };
      });
      const [west, south, east, north] = terrain.bounds4326;
      map = new maplibregl.Map({
        container: container.current, style: makeStyle("satellite"),
        center: [(west + east) / 2, (south + north) / 2],
        zoom: 9, pitch: flat ? 0 : 55, bearing: flat ? 0 : -15,
        dragRotate: !flat, touchPitch: !flat,
        maxPitch: 85,
      });
      const instance = map;
      mapRef.current = instance;
      const onStyle = () => {
        if (!instance.getSource(LOCAL_DEM)) {
          instance.addSource(LOCAL_DEM, {
            type: "raster-dem", tiles: [protocol + "://tiles/{z}/{x}/{y}.png"],
            encoding: "terrarium", tileSize: 256,
            minzoom: 0, maxzoom: terrainRecommendedMaxZoom(terrain),
          });
        }
        if (!instance.getSource(GLOBAL_DEM)) {
          instance.addSource(GLOBAL_DEM, {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium", tileSize: 256, maxzoom: 14,
          });
        }
        instance.setTerrain(flat ? null : {
          source: elevationRef.current === "local" ? LOCAL_DEM : GLOBAL_DEM,
          exaggeration,
        });
        if (!instance.getSource(FOOTPRINT_ID)) {
          instance.addSource(FOOTPRINT_ID, { type: "geojson", data: footprint(terrain) });
          instance.addLayer({
            id: FOOTPRINT_ID + "-fill", type: "fill", source: FOOTPRINT_ID,
            paint: { "fill-color": "#22d3ee", "fill-opacity": 0.07 },
          });
          instance.addLayer({
            id: FOOTPRINT_ID + "-outline", type: "line", source: FOOTPRINT_ID,
            paint: { "line-color": "#06b6d4", "line-width": 3,
              "line-dasharray": [3, 2] },
          });
        }
        syncGeoOverlays(instance, overlaysRef.current);
      };
      instance.on("style.load", onStyle);
      instance.on("load", () => instance.fitBounds(
        [[west, south], [east, north]],
        { padding: 46, duration: 0, maxZoom: 14 },
      ));
      instance.on("mousemove", (event) =>
        setCoordinates([event.lngLat.lng, event.lngLat.lat]));
      instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      instance.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      resize = new ResizeObserver(() => instance.resize());
      resize.observe(container.current);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o mapa do DEM.");
      map?.remove();
      maplibregl.removeProtocol(protocol);
      mapRef.current = null;
      return;
    }
    return () => {
      resize?.disconnect();
      map?.remove();
      mapRef.current = null;
      maplibregl.removeProtocol(protocol);
    };
  }, [terrain, isValid]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(BASE_ID) as maplibregl.RasterTileSource | undefined;
    if (source) source.setTiles([BASEMAPS[basemap].url]);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      syncGeoOverlays(map, overlays);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao mostrar camadas geográficas.");
    }
  }, [overlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setTerrain(flat ? null : {
      source: elevation === "local" ? LOCAL_DEM : GLOBAL_DEM, exaggeration,
    });
    if (flat) map.dragRotate.disable();
    else map.dragRotate.enable();
    map.easeTo({ pitch: flat ? 0 : 55, bearing: flat ? 0 : map.getBearing(), duration: 350 });
  }, [elevation, exaggeration, flat]);

  if (!isValid) return <div className="gm-terrain-map-unavailable" role="alert">
    {translate("Este DEM não possui coordenadas ou um CRS geográfico válido para o mapa.")}
  </div>;

  const [west, south, east, north] = terrain.bounds4326;
  return <div className="gm-terrain-geographic">
    <div className="gm-terrain-geographic-map" ref={container}
      role="region" aria-label={translate("DEM georreferenciado sobre mapa de base")}/>
    <div className="gm-terrain-geographic-tools">
      <label>{translate("Mapa de base")}
        <select value={basemap} onChange={event=>setBasemap(event.target.value as Basemap)}
          aria-label={translate("Escolher mapa de base")}>
          {Object.entries(BASEMAPS).map(([key, value]) =>
            <option key={key} value={key}>{translate(value.label)}</option>)}
        </select>
      </label>
      <label>{translate("Elevação")}
        <select value={elevation} onChange={event=>setElevation(event.target.value as Elevation)}
          aria-label={translate("Fonte da elevação 3D")}>
          <option value="local">{translate("DEM carregado")}</option>
          <option value="global">{translate("Relevo global de referência")}</option>
        </select>
      </label>
      <button type="button" onClick={() => mapRef.current?.fitBounds(
        [[west, south], [east, north]], { padding: 42, duration: 600, maxZoom: 14 },
      )}>{translate("Localizar DEM")}</button>
    </div>
    <div className="gm-terrain-geographic-info">
      <strong>{translate("Localização real do DEM")}</strong>
      <span>{((west + east) / 2).toFixed(5)}°, {((south + north) / 2).toFixed(5)}° · {terrain.crs}</span>
      {coordinates && <span>
        {translate("Cursor")}: {coordinates[0].toFixed(5)}°, {coordinates[1].toFixed(5)}°
      </span>}
      <small>{translate("Contorno azul: extensão do DEM. Fora do DEM, o relevo local é uma referência plana; não corresponde a medições.")}</small>
    </div>
    {error && <p className="gm-terrain-geographic-error" role="alert">{error}</p>}
  </div>;
}
