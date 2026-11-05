/**
 * GeoMoz product visibility, separate from permissions and saved user preferences.
 * Reintroduce a reviewed group here; never use a URL or storage flag.
 * Registries, readers, algorithms and original menus remain in the engine source.
 */
export const GEOMOZ_ROLLOUT = Object.freeze({
  advancedData: false,
  specialistProcessing: false,
  immersive: false,
  advancedDrawing: true,
  fullMenus: false,
  fullLayerManager: false,
});
export type Rollout = {readonly [K in keyof typeof GEOMOZ_ROLLOUT]:boolean};
export const CORE_VECTOR_TOOLS = Object.freeze(["buffer","clip","intersection","dissolve","reproject"]);
export const CORE_RASTER_TOOLS = Object.freeze(["slope","hillshade","contour","clip-extent","clip-mask","reproject"]);
export const CORE_DATA_SOURCES = Object.freeze(["vector","raster","delimited-text","xyz","wms","wfs","wmts"]);
const CORE_COMMANDS = new Set([
  "project.new","project.open-file","project.open-url","project.save","project.save-as","project.print-layout",
  ...CORE_DATA_SOURCES.map(id=>"add."+id),
  ...CORE_VECTOR_TOOLS.map(id=>"proc.vector."+id),
  ...CORE_RASTER_TOOLS.map(id=>"proc.raster."+id),
  "plugin.maplibre-gl-geo-editor","plugin.maplibre-basemap-control","proc.georeferencer",
  "control.measure","control.search","control.legend","control.colorbar",
  "view.zoom-in","view.zoom-out","view.previous","view.next","view.reset-north","view.reset-pitch","view.theme",
  "help.shortcuts","help.diagnostics",
]);
const ADVANCED_DATA = new Set(["geoparquet","flatgeobuf","pmtiles","stac","zarr","netcdf","duckdb","cad","gpx","landxml","gdb","postgres","mssql","iceberg","osm-pbf","spaceborne-lidar","lidar","arcgis","wcs","mbtiles"]);
const CORE_PROJECT_ITEMS = new Set(["project.new","project.open","project.openFrom","project.openFile","project.openUrl","project.openRecent","project.save","project.saveAs","project.history","project.export","project.exportLayers","project.printLayout"]);
export function isGeoMozCommandVisible(id:string, rollout:Rollout=GEOMOZ_ROLLOUT):boolean {
  if(CORE_COMMANDS.has(id))return true;
  if(id.startsWith("add.")&&rollout.advancedData&&ADVANCED_DATA.has(id.slice(4)))return true;
  if(id.startsWith("proc.")&&rollout.specialistProcessing)return true;
  return rollout.fullMenus;
}
export function curateGeoMozCommands<T extends {id:string}>(commands:readonly T[], rollout:Rollout=GEOMOZ_ROLLOUT):T[] {
  return commands.filter(command=>isGeoMozCommandVisible(command.id,rollout));
}
export function isGeoMozDataSourceVisible(id:string):boolean {
  return CORE_DATA_SOURCES.includes(id)||(GEOMOZ_ROLLOUT.advancedData&&ADVANCED_DATA.has(id));
}
export function isGeoMozPluginVisible(id:string):boolean {
  return isGeoMozCommandVisible("plugin."+id);
}
export function isGeoMozMenuItemVisible(id:string):boolean {
  if(!id.startsWith("project."))return true;
  return CORE_PROJECT_ITEMS.has(id)||GEOMOZ_ROLLOUT.fullMenus;
}
export function isGeoMozToolVisible(family:"vector"|"raster",id:string):boolean {
  return GEOMOZ_ROLLOUT.specialistProcessing||(family==="vector"?CORE_VECTOR_TOOLS:CORE_RASTER_TOOLS).includes(id);
}
