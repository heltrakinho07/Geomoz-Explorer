declare module "shpjs" {
  import type { FeatureCollection } from "geojson";

  type ShpResult = FeatureCollection | FeatureCollection[];

  function shp(input: ArrayBuffer | string): Promise<ShpResult>;
  export default shp;
}
