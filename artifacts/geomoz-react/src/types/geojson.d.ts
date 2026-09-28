declare module "geojson" {
  export type Position = number[];
  export type BBox = number[];

  export interface GeoJsonObject {
    type: string;
    bbox?: BBox;
  }

  export type GeoJsonProperties = { [name: string]: any } | null;

  export interface Point extends GeoJsonObject {
    type: "Point";
    coordinates: Position;
  }

  export interface MultiPoint extends GeoJsonObject {
    type: "MultiPoint";
    coordinates: Position[];
  }

  export interface LineString extends GeoJsonObject {
    type: "LineString";
    coordinates: Position[];
  }

  export interface MultiLineString extends GeoJsonObject {
    type: "MultiLineString";
    coordinates: Position[][];
  }

  export interface Polygon extends GeoJsonObject {
    type: "Polygon";
    coordinates: Position[][];
  }

  export interface MultiPolygon extends GeoJsonObject {
    type: "MultiPolygon";
    coordinates: Position[][][];
  }

  export interface GeometryCollection extends GeoJsonObject {
    type: "GeometryCollection";
    geometries: Geometry[];
  }

  export type Geometry =
    | Point
    | MultiPoint
    | LineString
    | MultiLineString
    | Polygon
    | MultiPolygon
    | GeometryCollection;

  export interface Feature<
    G extends Geometry | null = Geometry,
    P = GeoJsonProperties,
  > extends GeoJsonObject {
    type: "Feature";
    geometry: G;
    properties: P;
    id?: string | number;
  }

  export interface FeatureCollection<
    G extends Geometry = Geometry,
    P = GeoJsonProperties,
  > extends GeoJsonObject {
    type: "FeatureCollection";
    features: Array<Feature<G, P>>;
  }
}
