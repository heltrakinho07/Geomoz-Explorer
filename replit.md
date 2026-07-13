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

## GeoAnálises (Sprint 2 — completo)

- **Perfil Topográfico A→B** (`POST /gee/profile`): user clica 2+ pontos no mapa, polyline desenhada (tracejado azul + markers A/B/…), backend amostra DEM Copernicus GLO-30 em N pontos (50–500, default 200) via `dem.sampleRegions(scale=30)` numa única chamada batched. Saída: distance/elevation arrays + stats (min/max/mean/gain/loss/totalDistance). Frontend renderiza Recharts ComposedChart (Area + Line, eixo distância km, eixo elevação m, ReferenceLine média) num overlay 200px no fundo do mapa.
- **Curvas de Nível** (`POST /gee/contours`): equidistância configurável (10/20/25/50/100/200/500 m), linhas-mestras a cada N× (slider 2–10). Backend usa `dem.mod(interval).abs().lt(interval*0.05)` → máscara binária visualizada como linhas finas castanhas (#8b5a2b) + linhas-mestras mais escuras (#3a1c0c). Retorna 2 tile URLs + min/max elevação + lista de intervals presentes na região. Frontend mostra como duas TileLayers sobrepostas com legenda lateral.
- Ambos GEE-only, sob grupo "Relevo". Ícones Route (perfil) e Waves (curvas).

## GeoAnálises (Sprint 3 — completo)

- **Classes Topográficas Customizáveis** (`POST /gee/topo-classes`): user define N limites de elevação (m) e N+1 classes com cor + nome editáveis. Backend usa `dem.gte(b)` somado iterativamente para classificar pixels em índice 1..N+1, opcional overlay de água (HydroSHEDS) como classe extra. Retorna tile + áreas por classe (km² + %). UI tem editor de cores (HTML color picker), nomes editáveis, slider de limites, botão "Aplicar Classes". Validação client-side: limites têm de ser estritamente crescentes (botão Run desabilita + warning visual se não). `hasWater` no response indica se overlay foi realmente aplicado (não apenas pedido).
- **Perfil Topográfico — Cursor Sincronizado**: hover no gráfico Recharts (`onMouseMove` com `isTooltipActive`+`activeTooltipIndex`) emite índice → marker âmbar pisca-pisca aparece no mapa na posição correspondente da polyline A→B. Limpa em `onMouseLeave` ou quando cursor sai da área do tooltip.

## GeoAnálises (Sprint 4 — completo)

- **Reorganização por tipo de índice**: tab bar dividida em 6 grupos com nome + badge de fonte: "Mosaico Óptico" (Sentinel-2 EOX), "Vegetação & Mineralogia" (S2 · 10–20 m), "Landsat 8" (· 30 m), "Relevo & Morfologia" (DEM GLO-30 · 30 m), "Estruturas Geológicas" (GEE DEM + Sobel), "Potencial Mineral" (GEE Multi-critério).
- **Legendas geocientíficas por índice**: painel lateral mostra badge do grupo, escala de cor (sempre visível, proxy ou GEE), interpretação geocientífica completa, fórmula em destaque, bandas utilizadas.
- Separadores visuais `│` entre grupos; badge de fonte em cor por grupo.

## Bacias Hidrográficas — HidroGeoMoz (completo + sprint 2)

- **Nova tab "Bacias Hidrográficas"** (ícone Droplets, accent azul) no nav do Explorer.
- **Dois modos** via toggle na sidebar:
  - **"Explorar Bacias"**: HydroBASINS L5–L8 clicáveis (tenta múltiplos IDs de colecção; se indisponível, sugere modo delimitar).
  - **"Delimitar Bacia"**: clique em qualquer ponto do mapa → watershed delineado por algoritmo D8 em HydroSHEDS 15DIR + snap automático ao canal mais próximo. Configura expansão máxima (passos 20–200, ~500 m/passo). Mostra polígono + stats automáticos.
- **Gerador de Linhas de Água** multi-ordem (aprox. Strahler 1–5 via ACC thresholds: 100/500/2k/10k/50k). Toggle "todas as ordens vs rios principais". Paleta azul clara→escura.
- **Backend** (`gee_module.py`): `compute_basins()` (HydroBASINS, múltiplos IDs + fallback gracioso), `compute_basin_stats()`, `compute_drainage_tile()`, `compute_river_network()` (multi-ordem), `compute_watershed_from_point()` (D8 iterativo).
- **API** (`api.py`): `POST /gee/basins`, `/gee/basin-stats`, `/gee/drainage`, `/gee/river-network`, `/gee/watershed`.
- **D8 algorithm**: tradução pixel-a-pixel usando `Image.translate(-1,0,"pixels",proj)` para cada um dos 8 vizinhos; acumula basin mask em `max_iter` iterações; converte para polígono via `reduceToVectors`.
- **Nota**: HydroBASINS `WWF/HydroSHEDS/v1/Basins/hybas_af_lev0X_v1c` pode não estar disponível neste service account — usa-se D8/DEM como alternativa principal.
- Índices de risco: erosão (slope 50% + NDVI inv 30% + precip 20%), cheia (flatness 40% + precip 40% + NDWI 20%), hidrogeológico (slope Gaussian pico 10° + precip + NDVI).

## SPI × NDVI — Seca Meteorológica (completo, 2026-07)

- **Nova análise "SPI × NDVI"** no grupo "Seca & Stress Hídrico" do GeoAnálises.
- **Backend** (`compute_spi_ndvi` em gee_module.py + `POST /gee/spi-ndvi`): SPI = z-score
  por pixel do total anual CHIRPS face à climatologia 2001→ano−1 (aprox. SPI-12);
  NDVI = média anual MODIS MOD13A2 ×0.0001. Devolve 2 tile URLs, pares amostrados
  (50–2000, default 400), Pearson r + p-value (server-side, `ee.Reducer.pearsonsCorrelation`),
  % área em seca (SPI < −1), trendline OLS (numpy polyfit).
- **Frontend**: painel com ano/amostras, toggle camada SPI/NDVI, scatter Recharts
  (ComposedChart + Scatter + trendline + ReferenceLine em SPI=−1) em overlay 380×230.

## Cruzamento Espacial — Targeting × Admin (completo, 2026-07)

- **Botão "Cruzamento Espacial (relatório)"** no painel Targeting após um run.
- **Backend**: `compute_targeting_zones` (gee_module) vetoriza score ≥ limiar via
  `reduceToVectors` a 300 m (máx 300 zonas); `_build_targeting_score` extraído de
  `compute_targeting_tile` (partilhado). `POST /gee/targeting-overlap` (api.py) cruza
  as zonas com geopandas: overlay com distritos (área km² por distrito), sjoin com
  aldeias (`geomoz.read_village`) e postos admin (`geomoz.read_admin_post`).
  Cada secção degrada graciosamente com nota em `report.notes`.
- **Frontend**: zonas desenhadas no mapa (GeoJSON indigo tracejado), tabela por
  distrito com barras + export CSV, chips de aldeias.

## Exportador (completo, 2026-07)

- Tab "Exportar": PDF (jsPDF), HTML interactivo, CSV, GeoJSON, **PNG** e **Shapefile**.
- **PNG**: renderização em canvas offscreen 1600×1100 sem dependências novas — tiles
  CARTO (crossOrigin anonymous), polígonos de geologia com `_color`, fronteiras,
  legenda top-8 litologias, barra de escala, seta de norte, header/footer.
- **Shapefile**: `GET /export/shapefile?province&district&layer=geology|provinces|districts`
  — clip como /geology, `gdf.to_file(driver="ESRI Shapefile")` em tempdir, ZIP em memória.
  Explode geometrias e filtra só polígonos (SHP não mistura tipos).

## Search bar (melhorada, 2026-07)

- Pesquisa Nominatim com **debounce 450 ms** (≥3 chars, Enter continua a forçar) e
  **toggle MZ/🌍** (countrycodes=mz vs mundial). `skipAutoSearchRef` evita re-pesquisa
  ao seleccionar um resultado.

## Future Evolution (Sprints 3+)

1. **AI interpretador**: LLM resume área seleccionada com base em geologia + targeting (aguarda manuais do user; LLM escolhido = Claude Anthropic via `.local/skills/ai-integrations-anthropic`).
2. **Time-series NDVI 2018→2025**: comparador temporal Sentinel-2.
3. **Admin Posts / Villages layers no mapa**: já disponíveis em geomoz (usados no cruzamento espacial).
