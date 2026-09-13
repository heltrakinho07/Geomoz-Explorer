export type BasemapType = "hybrid" | "terrain" | "satellite" | "roadmap";

export interface BasemapLayerConfig {
  id: BasemapType;
  label: string;
  icon: string;
  url: string;
  subdomains: string;
  maxZoom: number;
  attribution: string;
}

export const GOOGLE_BASEMAPS: Record<BasemapType, BasemapLayerConfig> = {
  hybrid: {
    id: "hybrid",
    label: "Google Híbrido",
    icon: "Satellite",
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps",
  },
  terrain: {
    id: "terrain",
    label: "Google Relevo",
    icon: "Mountain",
    url: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps",
  },
  satellite: {
    id: "satellite",
    label: "Google Satélite",
    icon: "Globe",
    url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps",
  },
  roadmap: {
    id: "roadmap",
    label: "Google Estradas",
    icon: "Map",
    url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps",
  },
};

export const DEFAULT_BASEMAP: BasemapLayerConfig = GOOGLE_BASEMAPS.hybrid;
