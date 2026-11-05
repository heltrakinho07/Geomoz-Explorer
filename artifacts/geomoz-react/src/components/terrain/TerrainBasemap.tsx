/**
 * Real-world DEM positioning within the native GeoMoz GIS Workspace.
 * A real georeferenced DEM mesh overlays continuous global 3D terrain.
 * MapLibre keeps the satellite/topographic basemap visible around the patch.
 */
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./terrain-basemap.css";
import proj4 from "proj4";
import type { TerrainMeshData, TerrainVisualStyle } from "@/lib/terrain-webgl";
import { terrainProjection, validTerrainGeography } from "@/lib/terrain-map-geo";
import { createTerrainMapMesh, type TerrainMapMesh, type ModelAppearance, LOCAL_MODEL_ID } from "@/lib/terrain-map-mesh";

import { BASEMAPS, type Basemap, terrainBasemapStyle, selectTerrainBasemap, exportTerrainMap, satelliteTextureUrl, useTerrainSatelliteTexture } from "@/lib/terrain-basemap";
interface Props {
  terrain: TerrainMeshData;
  exaggeration: number;
  style: TerrainVisualStyle;
  rasterTexture: string | null;
  translate?: (value: string) => string;
}
const GLOBAL_DEM = "geomoz-global-raster-dem";
const FOOTPRINT_ID = "geomoz-dem-footprint";

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

export default function TerrainBasemap({
  terrain, exaggeration, style, rasterTexture,
  translate = (value) => value,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const modelRef = useRef<TerrainMapMesh | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const basemapRef = useRef(basemap);
  basemapRef.current = basemap;
  const [showMesh,setShowMesh] = useState(true);
  const [modelOpacity,setModelOpacity] = useState(0.91);
  const [verticalOffset,setVerticalOffset] = useState(3);
  const [coordinates, setCoordinates] = useState<[number, number, boolean] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meshMounted,setMeshMounted] = useState(false);
  const isValid = validTerrainGeography(terrain);
  const flat = false;
  const [satelliteDrape, setSatelliteDrape] = useState(false);
  const [imageryOpacity, setImageryOpacity] = useState(1);
  const satellite = useTerrainSatelliteTexture(isValid && !flat && satelliteDrape && !rasterTexture
    ? satelliteTextureUrl(terrain.boundsMeters, terrain.crs) : null);
  const appearance: ModelAppearance = {
    exaggeration,offsetMeters:verticalOffset,opacity:modelOpacity,style,
    vectors:null,raster:rasterTexture ?? satellite.image,rasterOpacity:imageryOpacity,visible:showMesh && modelOpacity > 0,
  };
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  useEffect(() => {
    if (!container.current || !isValid) return;
    setMeshMounted(false);
    // Register UTM definitions for the densified footprint as well as the mesh.
    terrainProjection(terrain);
    let map: maplibregl.Map | null = null;
    let resize: ResizeObserver | null = null;
    try {
      const [west, south, east, north] = terrain.bounds4326;
      map = new maplibregl.Map({
        container: container.current, style: terrainBasemapStyle(basemapRef.current),
        canvasContextAttributes: { preserveDrawingBuffer: true },
        center: [(west + east) / 2, (south + north) / 2],
        zoom: 9, pitch: flat ? 0 : 55, bearing: flat ? 0 : -15,
        dragRotate: !flat, touchPitch: !flat,
        maxPitch: 85,
      });
      const instance = map;
      mapRef.current = instance;
      const onStyle = () => {
        selectTerrainBasemap(instance, basemapRef.current);
        // Global Mapzen terrain continues under and outside the local DEM.
        if (!instance.getSource(GLOBAL_DEM)) {
          instance.addSource(GLOBAL_DEM, {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium", tileSize: 256, maxzoom: 14,
          });
        }
        instance.setTerrain(flat ? null : { source: GLOBAL_DEM, exaggeration: 1 });
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
        if (!flat && !instance.getLayer(LOCAL_MODEL_ID)) {
          const layer = createTerrainMapMesh(terrain, appearanceRef.current);
          modelRef.current = layer;
          try { instance.addLayer(layer); setMeshMounted(true); }
          catch (cause) {
            modelRef.current = null;
            setMeshMounted(false);
            setError(cause instanceof Error ? cause.message : "Não foi possível mostrar a malha 3D.");
          }
        }
      };
      instance.on("style.load", onStyle);
      instance.on("load", () => instance.fitBounds(
        [[west, south], [east, north]],
        { padding: 46, duration: 0, maxZoom: 14 },
      ));
      instance.on("mousemove", ({ lngLat }) => {
        const [x, y] = proj4("EPSG:4326", terrain.crs, [lngLat.lng, lngLat.lat]);
        const [left, bottom, right, top] = terrain.boundsMeters;
        setCoordinates([lngLat.lng, lngLat.lat, x >= left && x <= right && y >= bottom && y <= top]);
      });
      instance.on("mouseout", () => setCoordinates(null));
      instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      instance.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      resize = new ResizeObserver(() => instance.resize());
      resize.observe(container.current);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o mapa do DEM.");
      map?.remove();
      mapRef.current = null;
      return;
    }
    return () => {
      resize?.disconnect();
      map?.remove();
      mapRef.current = null;
      modelRef.current = null;
    };
  }, [terrain, isValid]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) selectTerrainBasemap(map, basemap);
  }, [basemap]);

  useEffect(() => {
    modelRef.current?.update(appearance);
  }, [exaggeration, style, rasterTexture,
      showMesh, modelOpacity, verticalOffset, satellite.image, imageryOpacity]);


  if (!isValid) return <div className="gm-terrain-map-unavailable" role="alert">
    {translate("Este DEM não possui coordenadas ou um CRS geográfico válido para o mapa.")}
  </div>;

  const [west, south, east, north] = terrain.bounds4326;
  return <div className="gm-terrain-geographic"
    data-testid={meshMounted && !flat ? "geomoz-georeferenced-model-map" : undefined}>
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
      {!flat && <>
        <label className="gm-terrain-model-toggle">
          <input type="checkbox" checked={showMesh}
            onChange={event=>setShowMesh(event.target.checked)}/>
          {translate("Sobrepor modelo 3D")}
        </label>
        <label>{translate("Transparência do modelo")} · {Math.round((1-modelOpacity)*100)}%
          <input type="range" min="0" max="1" step="0.05"
            aria-label={translate("Transparência do modelo 3D")}
            value={1-modelOpacity} onChange={event=>setModelOpacity(1-Number(event.target.value))}/>
        </label>
        {!rasterTexture && <label className="gm-terrain-model-toggle">
          <input type="checkbox" checked={satelliteDrape}
            onChange={event => setSatelliteDrape(event.target.checked)}/>
          {translate("Textura Esri no DEM")}
        </label>}
        {(satellite.image || rasterTexture) && <label>{translate("Opacidade da textura")} · {Math.round(imageryOpacity * 100)}%
          <input type="range" min="0" max="1" step="0.05" value={imageryOpacity}
            onChange={event => setImageryOpacity(Number(event.target.value))}/>
        </label>}
        <label>{translate("Ajuste vertical")} · {verticalOffset} m
          <input type="range" min="-250" max="250" step="1"
            aria-label={translate("Ajuste vertical do modelo 3D")}
            value={verticalOffset} onChange={event=>setVerticalOffset(Number(event.target.value))}/>
        </label>
      </>}
      <button type="button" onClick={() => mapRef.current?.fitBounds(
        [[west, south], [east, north]], { padding: 42, duration: 600, maxZoom: 14 },
      )}>{translate("Localizar DEM")}</button>
      {!flat && (["png", "pdf"] as const).map(format => <button key={format} type="button"
        disabled={!meshMounted}
        onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          const details = [
            terrain.crs + " · " + exaggeration + "× · " + verticalOffset + " m · " + translate(BASEMAPS[basemap].label),
            translate("Perspectiva 3D · escala variável · relevo exterior: Mapzen"),
          ];
          setError(null);
          void exportTerrainMap(map, format, terrain.name, details, [BASEMAPS[basemap].attribution, satellite.image && basemap !== "satellite" ? BASEMAPS.satellite.attribution : ""].filter(Boolean).join(" · "))
            .catch(() => setError(translate("Falha ao exportar o mapa 3D.")));
        }}>{format === "pdf" ? translate("Layout PDF") : "PNG"}</button>)}
    </div>
    <div className="gm-terrain-geographic-info">
      <strong>{translate("Modelo 3D sobre terreno global")}</strong>
      <span>{((west + east) / 2).toFixed(5)}°, {((south + north) / 2).toFixed(5)}° · {terrain.crs}</span>
      {coordinates && <span>
        {translate("Cursor")}: {coordinates[0].toFixed(5)}°, {coordinates[1].toFixed(5)}° · {translate(coordinates[2] ? "Dentro do limite do DEM" : "Fora da área do projecto")}
      </span>}
      {satelliteDrape && !rasterTexture && <span role="status">{translate(satellite.failed
        ? "Textura Esri indisponível" : satellite.image ? "Textura: Esri World Imagery" : "A alinhar textura Esri…")}</span>}
      <small>{translate("Fora do DEM e nas lacunas aparece o relevo global de referência. Confirme o datum vertical de ambas as fontes. O ajuste em metros só desloca a malha na vista.")}</small>
    </div>
    {error && <p className="gm-terrain-geographic-error" role="alert">{error}</p>}
  </div>;
}
