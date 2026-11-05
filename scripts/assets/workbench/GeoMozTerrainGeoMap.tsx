/**
 * Real-world DEM positioning within the native GeoMoz GIS Workspace.
 * A real georeferenced DEM mesh overlays continuous global 3D terrain.
 * MapLibre keeps the satellite/topographic basemap visible around the patch.
 */
import { useEffect, useRef, useState } from "react";
import { composeTerrainTexture, renderLicensedXYZTexture, validLicensedXYZTemplate } from "./geomoz-terrain-texture-stack";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import proj4 from "proj4";
import type { TerrainMeshData, TerrainVisualStyle } from "../../lib/geomoz-terrain-webgl";
import type { GeoMozTerrainOverlay } from "./geomoz-terrain-overlays";
import { terrainProjection, validTerrainGeography } from "./geomoz-terrain-tiles";
import { createTerrainMapMesh, type TerrainMapMesh, type ModelAppearance, LOCAL_MODEL_ID } from "./geomoz-terrain-map-mesh";

type Basemap = "satellite" | "topographic" | "streets" | "licensed";
interface Props {
  terrain: TerrainMeshData;
  overlays: GeoMozTerrainOverlay[];
  exaggeration: number;
  style: TerrainVisualStyle;
  vectorTexture: string | null;
  rasterTexture: string | null;
  rasterOpacity: number;
  /** Split view uses a north-up, truly flat overview alongside the local 3D canvas. */
  flat?: boolean;
  translate?: (value: string) => string;
}
const BASEMAPS: Record<Exclude<Basemap,"licensed">, { label: string; url: string; attribution: string }> = {
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
const GLOBAL_DEM = "geomoz-global-raster-dem";
const FOOTPRINT_ID = "geomoz-dem-footprint";
const VECTOR_PREFIX = "geomoz-draped-layer-";

function makeStyle(which: Exclude<Basemap,"licensed">): maplibregl.StyleSpecification {
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
  const pairs = Object.entries(overlay.categories).flatMap(([category, color]) => [category, color]);
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
  terrain, overlays, exaggeration, style, vectorTexture, rasterTexture,
  rasterOpacity, flat = false, translate = (value) => value,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlaysRef = useRef(overlays);
  const modelRef = useRef<TerrainMapMesh | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [xyzTemplate,setXYZTemplate] = useState("");
  const [xyzAttribution,setXYZAttribution] = useState("");
  const [xyzAuthorized,setXYZAuthorized] = useState(false);
  const [licensedXYZ,setLicensedXYZ] = useState<{url:string;credit:string}|null>(null);
  const [basemapTexture,setBasemapTexture] = useState<string|null>(null);
  const [terrainTexture,setTerrainTexture] = useState<string|null>(null);
  const [xyzBusy,setXYZBusy] = useState(false);
  const [xyzProgress,setXYZProgress] = useState("");
  const xyzAbort=useRef<AbortController|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    composeTerrainTexture([
      ...(basemapTexture?[{id:"xyz",imageDataUrl:basemapTexture,visible:true,opacity:1}]:[]),
      ...(rasterTexture?[{id:"thematic",imageDataUrl:rasterTexture,visible:true,opacity:rasterOpacity}]:[])
    ],controller.signal).then(setTerrainTexture).catch(e=>{
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Falha ao combinar texturas 3D.");
    });
    return ()=>controller.abort();
  },[basemapTexture,rasterTexture,rasterOpacity,terrain]);
  useEffect(()=>()=>xyzAbort.current?.abort(),[]);
  async function applyXYZ(){
    if(!xyzAuthorized||!xyzAttribution.trim()||!validLicensedXYZTemplate(xyzTemplate)){
      setError("Indique uma fonte XYZ HTTPS autorizada e respectiva atribuição. O serviço público OSM não é permitido.");
      return;
    }
    xyzAbort.current?.abort();
    const controller=new AbortController();xyzAbort.current=controller;
    setXYZBusy(true);setXYZProgress("A preparar mosaico XYZ…");setError(null);
    try {
      terrainProjection(terrain);
      const result=await renderLicensedXYZTexture(terrain,xyzTemplate,{
        signal:controller.signal,
        onProgress:(done,total)=>setXYZProgress("Tiles "+done+"/"+total),
      });
      if(controller.signal.aborted)return;
      setBasemapTexture(result.imageDataUrl);
      setLicensedXYZ({url:xyzTemplate,credit:xyzAttribution.trim()});
      setBasemap("licensed");
      setXYZProgress("Textura georreferenciada · "+result.tiles+" tiles · zoom "+result.zoom);
    }catch(e) {
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Falha CORS do serviço XYZ.");
    }finally {
      if(xyzAbort.current===controller){xyzAbort.current=null;setXYZBusy(false);}
    }
  }
  function clearXYZ(){
    xyzAbort.current?.abort();setBasemapTexture(null);setLicensedXYZ(null);
    if(basemap==="licensed")setBasemap("satellite");
    setXYZProgress("");
  }
  const [showMesh,setShowMesh] = useState(true);
  const [modelOpacity,setModelOpacity] = useState(0.91);
  const [verticalOffset,setVerticalOffset] = useState(3);
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meshMounted,setMeshMounted] = useState(false);
  const isValid = validTerrainGeography(terrain);
  overlaysRef.current = overlays;
  const appearance: ModelAppearance = {
    exaggeration,offsetMeters:verticalOffset,opacity:modelOpacity,style,
    vectors:vectorTexture,raster:terrainTexture,rasterOpacity:terrainTexture?1:0,visible:showMesh && !flat,
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
        container: container.current, style: makeStyle("satellite"),
        center: [(west + east) / 2, (south + north) / 2],
        zoom: 9, pitch: flat ? 0 : 55, bearing: flat ? 0 : -15,
        dragRotate: !flat, touchPitch: !flat,
        maxPitch: 85,
      });
      const instance = map;
      mapRef.current = instance;
      const onStyle = () => {
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
        // Vector GIS features are draped onto the mesh in 3D, and normal GeoJSON layers in 2D.
        syncGeoOverlays(instance, flat ? overlaysRef.current : []);
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
      mapRef.current = null;
      return;
    }
    return () => {
      resize?.disconnect();
      map?.remove();
      mapRef.current = null;
      modelRef.current = null;
    };
  }, [terrain, isValid, flat]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(BASE_ID) as maplibregl.RasterTileSource | undefined;
    if (source) source.setTiles([basemap==="licensed"
      ?licensedXYZ?.url??BASEMAPS.satellite.url
      :BASEMAPS[basemap].url]);
  }, [basemap,licensedXYZ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      syncGeoOverlays(map, flat ? overlays : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao mostrar camadas geográficas.");
    }
  }, [overlays, flat]);

  useEffect(() => {
    modelRef.current?.update(appearance);
  }, [exaggeration, style, vectorTexture, terrainTexture,
      showMesh, modelOpacity, verticalOffset, flat]);


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
          {licensedXYZ&&<option value="licensed">XYZ autorizado · {licensedXYZ.credit}</option>}
        </select>
      </label>
      {!flat && <>
        <label className="gm-terrain-model-toggle">
          <input type="checkbox" checked={showMesh}
            onChange={event=>setShowMesh(event.target.checked)}/>
          {translate("Sobrepor modelo 3D")}
        </label>
        <label>{translate("Transparência do modelo")} · {Math.round((1-modelOpacity)*100)}%
          <input type="range" min="0.2" max="1" step="0.05"
            aria-label={translate("Transparência do modelo 3D")}
            value={modelOpacity} onChange={event=>setModelOpacity(Number(event.target.value))}/>
        </label>
        <label>{translate("Ajuste vertical")} · {verticalOffset} m
          <input type="range" min="-250" max="250" step="1"
            aria-label={translate("Ajuste vertical do modelo 3D")}
            value={verticalOffset} onChange={event=>setVerticalOffset(Number(event.target.value))}/>
        </label>
      </>}
      <button type="button" onClick={() => mapRef.current?.fitBounds(
        [[west, south], [east, north]], { padding: 42, duration: 600, maxZoom: 14 },
      )}>{translate("Localizar DEM")}</button>
    </div>
    {!flat&&<details className="gm-terrain-xyz-panel">
      <summary>Mapa-base como textura 3D</summary>
      <p>Indique um serviço XYZ com licença para esta utilização. Não é efectuado download automático de mosaicos Esri/OSM.</p>
      <button type="button" className="gm-terrain-xyz-preset"
        disabled={basemap==="streets"||basemap==="licensed"}
        title="Prepare a fonte actualmente seleccionada; só pode ser aplicada depois de confirmar autorização"
        onClick={()=>{
          if(basemap==="licensed"||basemap==="streets")return;
          setXYZTemplate(BASEMAPS[basemap].url);
          setXYZAttribution(BASEMAPS[basemap].attribution);
          setXYZAuthorized(false);
        }}>
        Preparar fonte do mapa-base seleccionado (licença necessária)
      </button>
      <label>Endereço XYZ HTTPS
        <input type="url" value={xyzTemplate} onChange={e=>setXYZTemplate(e.target.value)}
          placeholder="https://tiles.exemplo.com/{z}/{x}/{y}.png"
          aria-label="URL XYZ autorizado"/>
      </label>
      <label>Atribuição do fornecedor
        <input value={xyzAttribution} onChange={e=>setXYZAttribution(e.target.value)}
          placeholder="© Fornecedor / licença" aria-label="Atribuição da imagem XYZ"/>
      </label>
      <label className="gm-terrain-xyz-consent">
        <input type="checkbox" checked={xyzAuthorized}
          onChange={e=>setXYZAuthorized(e.target.checked)}/>
        Confirmo que esta fonte permite a utilização dos tiles como textura.
      </label>
      <div className="gm-terrain-xyz-buttons">
        <button type="button" onClick={()=>void applyXYZ()}
          disabled={!xyzAuthorized||xyzBusy||!xyzAttribution.trim()||!validLicensedXYZTemplate(xyzTemplate)}>
          {xyzBusy?"A processar…":"Aplicar XYZ ao DEM"}
        </button>
        {licensedXYZ&&<button type="button" onClick={clearXYZ}>Remover textura</button>}
        {xyzBusy&&<button type="button" onClick={()=>xyzAbort.current?.abort()}>Cancelar</button>}
      </div>
      {xyzProgress&&<small role="status">{xyzProgress}</small>}
      {licensedXYZ&&<small>Textura: {licensedXYZ.credit}</small>}
    </details>}
    <div className="gm-terrain-geographic-info">
      <strong>{translate("Modelo 3D sobre terreno global")}</strong>
      <span>{((west + east) / 2).toFixed(5)}°, {((south + north) / 2).toFixed(5)}° · {terrain.crs}</span>
      {coordinates && <span>
        {translate("Cursor")}: {coordinates[0].toFixed(5)}°, {coordinates[1].toFixed(5)}°
      </span>}
      <small>{translate("A malha local sobrepõe-se ao terreno global. Células sem dados deixam o relevo de referência visível. O ajuste vertical é apenas visual.")}</small>
    </div>
    {error && <p className="gm-terrain-geographic-error" role="alert">{error}</p>}
  </div>;
}
