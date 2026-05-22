# GeoMoz Explorer

A professional WebGIS platform for visualising and analysing geospatial data of Mozambique.

## Architecture

Two-artifact system:

| Artifact | URL | Stack | Purpose |
|---|---|---|---|
| GeoMoz Explorer | `/` | React + Vite + Leaflet | Interactive map dashboard |
| GeoMoz Python API | `/geomoz-api` | FastAPI + uvicorn | Geomoz data REST endpoints |

## Run & Operate

- **React frontend** — workflow `artifacts/geomoz-react: web` (auto-starts, port env-managed)
- **Python API** — workflow `artifacts/geomoz-explorer: GeoMoz Python API` (port 5001)

## Frontend Stack

- React 19 + Vite + TypeScript
- react-leaflet + Leaflet (interactive maps with CartoDB Light base tiles)
- TanStack Query (data fetching & caching)
- Tailwind CSS + shadcn/ui components
- Lucide React icons

## Python API Stack

- FastAPI + uvicorn (port 5001, served at `/geomoz-api`)
- geomoz library (Mozambique administrative + geological data)
- GeoPandas + Shapely (spatial ops, clipping, area calculations)
- All geomoz reads cached with `@lru_cache`

## Where things live

### React (artifacts/geomoz-react/src/)
- `App.tsx` — QueryClient provider + Explorer root
- `pages/Explorer.tsx` — main page, holds all state (province, district, layers, colorBy)
- `components/Sidebar.tsx` — filter dropdowns, layer toggles, color-by radio
- `components/MapView.tsx` — react-leaflet map with geology + province + district layers
- `components/StatsPanel.tsx` — stat cards, lithology bars, analysis table, CSV export
- `hooks/useGeoMoz.ts` — TanStack Query hooks for all API endpoints

### Python API (geomoz-explorer/)
- `api.py` — FastAPI app with all endpoints
- `utils/` — legacy Streamlit utilities (not used by FastAPI, kept for reference)

## Python API Endpoints

All under `/geomoz-api`:

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /province-names` | List of province names |
| `GET /provinces` | Province boundaries GeoJSON |
| `GET /district-names?province=X` | District names for a province |
| `GET /districts?province=X` | District boundaries GeoJSON |
| `GET /geology?province=X&district=Y&color_by=code2006` | Geology GeoJSON with `_color` property |
| `GET /stats?province=X&district=Y` | Area stats + top lithologies |
| `GET /geology-colors?color_by=code2006` | Deterministic color map for legend |

## UI Features

- Interactive CartoDB Light map with zoom/pan
- Toggle layers: Geology, Provinces, Districts
- Filter by Province → District (cascading dropdowns)
- Color geology by: code2006 / Legend / ERA / PERIOD
- Gradient stat cards: Features, Geological Units, Area km², Dominant lithology
- Progress bar chart: top lithologies by area %
- Detailed analysis table (sortable by %)
- CSV export of statistics
- Color legend synced to current color-by field

## Architecture Decisions

- All geomoz data reads are `@lru_cache`'d in the FastAPI layer — first load is slow (~5–10s for full Mozambique geology), subsequent requests are instant.
- Geometries are simplified at load time (tolerance 0.005–0.01) for fast Leaflet rendering.
- Geology colors are MD5-hash-based (deterministic across sessions).
- Area calculations use EPSG:32736 (UTM 36S) for metric accuracy.
- React Query caches responses: `staleTime: Infinity` for static data (provinces, names), `30s` for dynamic (geology, stats).
- The `_color` property is injected server-side on geology GeoJSON — the client reads it directly without recomputing colors.

## Gotchas

- First load of geology/stats for full Mozambique can take 10–20s while geomoz reads files and computes areas. Subsequent requests are fast (lru_cache).
- The districts layer is off by default — it adds many features. Enable only after selecting a province.
- `@types/leaflet` peer dependency warning against React 19 is harmless — leaflet works fine.

## User Preferences

_Populate as you build._

## GeoAnálises (Sprint 1 — completo)

- **Estruturas — Lineamentos automáticos** (`/gee/lineaments`): hillshade multi-azimute do DEM Copernicus GLO-30 → Canny (4 azimutes, max) + Sobel atan2 para direcção. Saída: tile densidade focal (raio 750 m default), tile edges, rosa de direcções 18 bins (10°), orientação dominante (N–S / NE–SW / E–W / NW–SE), densidade média.
- **Targeting — Potencial Mineral** (`/gee/targeting`, `/gee/minerals`): score 0–100 multi-critério ponderado por preset mineral. 8 presets: Ouro, Fe-óxidos, Cobre, Pegmatitos, Bauxite, Grafite, Carvão, Areias Pesadas. Suporta lista `invert` (e.g. slope invertido para minerais que preferem áreas planas). UI mostra gauge de favorabilidade (180° arc, palette plasma), P90/P95/P99, área favorável em km² (limiar ajustável).
- Ambos requerem GEE. Edges/density combinam-se como overlay com toggle.
- Stats usam `score.unmask(0)` antes de `reduceRegion` para evitar nulls quando bands têm máscaras parciais.

## Future Evolution (Sprints 2–4)

1. **Cruzamento espacial automático**: targeting × admin/villages/rios para relatório de overlap.
2. **Perfil topográfico A–B**: linha desenhada no mapa → query DEM → gráfico elevação.
3. **AI interpretador**: LLM resume área seleccionada com base em geologia + targeting (aguarda manuais do user para escolha de LLM).
4. **Exportador PDF/PNG/Shapefile**: `leaflet-image` + jsPDF + geopandas para SHP.
5. **Time-series NDVI 2018→2025**: comparador temporal Sentinel-2.
6. **Search bar**: geocoding Nominatim.
7. **Admin Posts / Villages layers**: já disponíveis em geomoz.
