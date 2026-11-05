/** Advanced Pro geomorphometry on a decimated 3D preview.
 * These are indicative statistics, NOT source-DEM measurements.
 * Distances come from the metric DEM CRS; NoData neighbourhoods are omitted.
 */
import type { TerrainMeshData } from "./terrain-webgl";

export const ASPECT_DIRECTIONS = ["N","NE","E","SE","S","SO","O","NO"] as const;
export interface TerrainProMetrics {
  source: "malha DEM de pré-visualização";
  width: number;
  height: number;
  crs: string;
  validPixels: number;
  completeWindows: number;
  percentilesMeters: {p10:number;p50:number;p90:number};
  elevationRangeMeters: number;
  meanTerrainRuggednessIndexMeters: number;
  meanLocalReliefMeters: number;
  dominantDownslopeAspect: string | null;
  aspectHistogram: Array<{ direction:string; percent:number; count:number }>;
}

function percentile(sorted: number[], q:number):number {
  if(sorted.length===0) return 0;
  const k=(sorted.length-1)*q, lower=Math.floor(k),upper=Math.ceil(k);
  return sorted[lower]+(sorted[upper]-sorted[lower])*(k-lower);
}

export function terrainProMetrics(mesh:TerrainMeshData):TerrainProMetrics {
  const {width,height,heights}=mesh;
  const samples=heights.filter((x):x is number=>typeof x==="number"&&Number.isFinite(x))
    .sort((a,b)=>a-b);
  if(width<2||height<2||samples.length===0)
    throw Error("A malha do DEM não contém dados de elevação suficientes.");
  const dx=(mesh.boundsMeters[2]-mesh.boundsMeters[0])/(width-1);
  const dy=(mesh.boundsMeters[3]-mesh.boundsMeters[1])/(height-1);
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||dx<=0||dy<=0)
    throw Error("O DEM precisa de coordenadas métricas válidas.");
  const histogram=new Array<number>(8).fill(0);
  let roughnessTotal=0,localReliefTotal=0,complete=0,aspects=0;
  for(let row=1;row<height-1;row++)for(let col=1;col<width-1;col++){
    const mid=row*width+col,center=heights[mid];
    const neighbourhood:number[]=[];
    for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
      const elevation=heights[(row+y)*width+col+x];
      if(elevation===null||!Number.isFinite(elevation))break;
      neighbourhood.push(elevation);
    }
    if(center===null||!Number.isFinite(center)||neighbourhood.length!==9)continue;
    const neighbors=neighbourhood.filter((_,i)=>i!==4);
    roughnessTotal+=Math.sqrt(neighbors.reduce((sum,h)=>sum+(h-center)**2,0));
    localReliefTotal+=Math.max(...neighbourhood)-Math.min(...neighbourhood);
    complete++;
    const dzdx=((heights[mid+1] as number)-(heights[mid-1] as number))/(2*dx);
    const dzdy=((heights[mid-width] as number)-(heights[mid+width] as number))/(2*dy);
    if(Math.hypot(dzdx,dzdy)<1e-9)continue;
    const azimuth=(Math.atan2(-dzdx,-dzdy)*180/Math.PI+360)%360;
    histogram[Math.floor((azimuth+22.5)/45)%8]++;
    aspects++;
  }
  const maxCount=Math.max(...histogram);
  return {
    source:"malha DEM de pré-visualização",
    width,height,crs:mesh.crs,validPixels:samples.length,completeWindows:complete,
    percentilesMeters:{p10:percentile(samples,.1),p50:percentile(samples,.5),p90:percentile(samples,.9)},
    elevationRangeMeters:samples[samples.length-1]-samples[0],
    meanTerrainRuggednessIndexMeters:complete?roughnessTotal/complete:0,
    meanLocalReliefMeters:complete?localReliefTotal/complete:0,
    dominantDownslopeAspect:aspects?ASPECT_DIRECTIONS[histogram.indexOf(maxCount)]:null,
    aspectHistogram:histogram.map((count,i)=>({direction:ASPECT_DIRECTIONS[i],
      count,percent:aspects?count*100/aspects:0})),
  };
}
