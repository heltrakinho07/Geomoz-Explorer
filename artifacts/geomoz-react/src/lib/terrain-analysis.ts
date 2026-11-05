/**
 * Terrain Studio preview analytics. Distances/slopes are computed in the mesh's
 * metric working CRS; geographic export uses a real WGS84 reprojection.
 * These estimates are based on the decimated preview, NOT the source DEM.
 */
import proj4 from "proj4";
import type { TerrainMeshData } from "./terrain-webgl";

export interface TerrainProfilePoint {
  distanceM: number;
  elevationM: number | null;
  lon: number;
  lat: number;
}
export interface TerrainProfile {
  points: TerrainProfilePoint[];
  distanceM: number;
  surfaceDistanceM: number;
  minElevationM: number;
  maxElevationM: number;
  gainM: number;
  lossM: number;
  averageGradePct: number;
}
type XY = [number, number];
export interface TerrainContourFeature {
  type: "Feature";
  properties: { elevation_m: number; source: "DEM de pré-visualização" };
  geometry: { type: "LineString"; coordinates: XY[] };
}
export interface TerrainContourCollection {
  type: "FeatureCollection";
  features: TerrainContourFeature[];
}

function ensureCrs(crs: string): void {
  const match = /^EPSG:(326|327)(\d{2})$/.exec(crs);
  if (match && !proj4.defs(crs)) {
    const zone = Number(match[2]);
    if (zone < 1 || zone > 60) throw new Error("Zona UTM inválida.");
    proj4.defs(crs, "+proj=utm +zone=" + zone +
      (match[1] === "327" ? " +south" : "") + " +datum=WGS84 +units=m +no_defs");
  }
  if (!proj4.defs(crs)) throw new Error("SRC do terreno não suportado: " + crs);
}

export function geographicToTerrain(mesh: TerrainMeshData, lon: number, lat: number): XY {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw new Error("Longitude ou latitude inválida.");
  }
  ensureCrs(mesh.crs);
  return proj4("EPSG:4326", mesh.crs, [lon, lat]) as XY;
}

export function terrainToGeographic(mesh: TerrainMeshData, x: number, y: number): XY {
  ensureCrs(mesh.crs);
  return proj4(mesh.crs, "EPSG:4326", [x, y]) as XY;
}

export function sampleTerrain(mesh: TerrainMeshData, x: number, y: number): number | null {
  const [left, bottom, right, top] = mesh.boundsMeters;
  if (!Number.isFinite(x) || !Number.isFinite(y) ||
    x < left || x > right || y < bottom || y > top) return null;
  const gx = (x - left) / (right - left) * (mesh.width - 1);
  const gy = (top - y) / (top - bottom) * (mesh.height - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(mesh.width - 1, x0 + 1);
  const y1 = Math.min(mesh.height - 1, y0 + 1);
  const v00 = mesh.heights[y0 * mesh.width + x0];
  const v10 = mesh.heights[y0 * mesh.width + x1];
  const v01 = mesh.heights[y1 * mesh.width + x0];
  const v11 = mesh.heights[y1 * mesh.width + x1];
  if ([v00, v10, v01, v11].some(v => v === null || !Number.isFinite(v))) return null;
  const dx = gx - x0, dy = gy - y0;
  return (v00 as number) * (1-dx) * (1-dy) +
    (v10 as number) * dx * (1-dy) +
    (v01 as number) * (1-dx) * dy +
    (v11 as number) * dx * dy;
}

export function terrainProfile(
  mesh: TerrainMeshData,
  startLonLat: XY,
  endLonLat: XY,
  count = 101
): TerrainProfile {
  if (!Number.isInteger(count) || count < 2 || count > 1001) {
    throw new Error("Número de amostras inválido.");
  }
  const [ax, ay] = geographicToTerrain(mesh, ...startLonLat);
  const [bx, by] = geographicToTerrain(mesh, ...endLonLat);
  const length = Math.hypot(bx-ax, by-ay);
  if (length <= 0 || !Number.isFinite(length)) throw new Error("Defina dois pontos diferentes.");
  const points: TerrainProfilePoint[] = [];
  let surfaceDistanceM = 0, gainM = 0, lossM = 0;
  let previous: number | null = null;
  for (let i=0; i<count; i++) {
    const t=i/(count-1), x=ax+t*(bx-ax), y=ay+t*(by-ay);
    const altitude = sampleTerrain(mesh,x,y);
    const [lon,lat] = terrainToGeographic(mesh,x,y);
    points.push({distanceM:length*t,elevationM:altitude,lon,lat});
    if (previous !== null && altitude !== null) {
      const dz=altitude-previous;
      surfaceDistanceM += Math.hypot(length/(count-1),dz);
      if (dz > 0) gainM += dz; else lossM -= dz;
    }
    previous=altitude;
  }
  const valid=points.filter(p=>p.elevationM!==null).map(p=>p.elevationM as number);
  if (!valid.length) throw new Error("O perfil não cruza células válidas do DEM.");
  const first=points[0].elevationM, last=points[points.length-1].elevationM;
  return {
    points, distanceM:length, surfaceDistanceM,
    minElevationM: Math.min(...valid), maxElevationM:Math.max(...valid),
    gainM, lossM,
    averageGradePct: first === null || last === null ? 0 : 100*(last-first)/length,
  };
}

export function terrainSlopeSummary(mesh: TerrainMeshData): {meanDeg:number;maxDeg:number;validCells:number} {
  const dx=(mesh.boundsMeters[2]-mesh.boundsMeters[0])/(mesh.width-1);
  const dy=(mesh.boundsMeters[3]-mesh.boundsMeters[1])/(mesh.height-1);
  let sum=0,max=0,count=0;
  for(let row=1;row<mesh.height-1;row++) for(let col=1;col<mesh.width-1;col++) {
    const center=row*mesh.width+col;
    const values=[mesh.heights[center-1],mesh.heights[center+1],
      mesh.heights[center-mesh.width],mesh.heights[center+mesh.width]];
    if(values.some(v=>v===null||!Number.isFinite(v)))continue;
    const dzdx=((values[1] as number)-(values[0] as number))/(2*dx);
    const dzdy=((values[2] as number)-(values[3] as number))/(2*dy);
    const deg=Math.atan(Math.hypot(dzdx,dzdy))*180/Math.PI;
    sum+=deg;max=Math.max(max,deg);count++;
  }
  return {meanDeg:count?sum/count:0,maxDeg:max,validCells:count};
}

/** Marching-squares contours on the preview mesh, with strict result cap. */
export function previewContours(
  mesh: TerrainMeshData, intervalM: number, maxSegments=30000
): TerrainContourCollection {
  if (!Number.isFinite(intervalM) || intervalM <= 0 || intervalM > 100000) {
    throw new Error("Intervalo de curvas de nível inválido.");
  }
  const first=Math.ceil(mesh.minElevation/intervalM)*intervalM;
  const levels=Math.floor((mesh.maxElevation-first)/intervalM)+1;
  if (levels > 50) throw new Error("Seleccione uma equidistância maior (máximo 50 curvas de nível).");
  const [left,bottom,right,top]=mesh.boundsMeters;
  const dx=(right-left)/(mesh.width-1),dy=(top-bottom)/(mesh.height-1);
  const edges=[[0,1],[1,2],[2,3],[3,0]] as const;
  const features:TerrainContourFeature[]=[];
  for(let li=0;li<levels;li++) {
    const level=first+li*intervalM;
    for(let row=0;row<mesh.height-1;row++) for(let col=0;col<mesh.width-1;col++) {
      const i=row*mesh.width+col;
      const values=[mesh.heights[i],mesh.heights[i+1],
        mesh.heights[i+mesh.width+1],mesh.heights[i+mesh.width]];
      if(values.some(v=>v===null||!Number.isFinite(v)))continue;
      const xs=[left+col*dx,left+(col+1)*dx,left+(col+1)*dx,left+col*dx];
      const ys=[top-row*dy,top-row*dy,top-(row+1)*dy,top-(row+1)*dy];
      const crossings:XY[]=[];
      for(const [a,b] of edges) {
        const va=values[a] as number,vb=values[b] as number;
        if((va<level&&vb>=level)||(va>=level&&vb<level)) {
          const t=(level-va)/(vb-va);
          crossings.push([xs[a]+t*(xs[b]-xs[a]),ys[a]+t*(ys[b]-ys[a])]);
        }
      }
      for(let j=0;j+1<crossings.length;j+=2) {
        if(features.length>=maxSegments) {
          throw new Error("Demasiados segmentos de contorno. Aumente a equidistância.");
        }
        features.push({
          type:"Feature", properties:{elevation_m:level,source:"DEM de pré-visualização"},
          geometry:{type:"LineString",coordinates:[
            terrainToGeographic(mesh,...crossings[j]),
            terrainToGeographic(mesh,...crossings[j+1])
          ]}
        });
      }
    }
  }
  return {type:"FeatureCollection",features};
}
