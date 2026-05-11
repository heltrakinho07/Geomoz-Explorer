# GeoMoz Explorer

WebGIS platform for visualising and analysing geospatial data of Mozambique using the `geomoz` library, Streamlit, Folium, and GeoPandas.

## Run & Operate

- `cd geomoz-explorer && streamlit run app.py` — run the Streamlit app (port 5000)
- Workflow: **GeoMoz Explorer** (auto-starts on port 5000)

## Stack

- Python 3.11
- Streamlit (UI framework)
- Folium + streamlit-folium (interactive maps)
- GeoPandas + Shapely (spatial data)
- geomoz (Mozambique administrative + geological data)
- pandas / numpy / matplotlib

## Where things live

- `geomoz-explorer/app.py` — main Streamlit application
- `geomoz-explorer/utils/data_loader.py` — cached GeoMoz data loading & spatial filtering
- `geomoz-explorer/utils/mapping.py` — Folium map building, layer helpers, legend
- `geomoz-explorer/utils/analysis.py` — geological statistics & area calculations (km²)
- `geomoz-explorer/utils/export.py` — HTML / CSV / GeoJSON export helpers
- `geomoz-explorer/.streamlit/config.toml` — Streamlit server config (port 5000, headless)
- `geomoz-explorer/outputs/` — exported files land here

## Architecture decisions

- All geomoz data loads are wrapped in `@st.cache_data` to avoid re-fetching on each interaction.
- Geometries are simplified (tolerance tuned per layer) before rendering to keep the web map fast.
- Geology colouring is deterministic via MD5 hash of the field value, so colours are stable across sessions.
- Area calculations reproject to EPSG:32736 (UTM 36S) for metric accuracy in Mozambique.
- Future modules (Satellite / GEE, GeoMoz AI) are scaffolded as code stubs in separate tabs — ready to activate.

## Product

A functional WebGIS MVP where users can:
- View an interactive map of Mozambique with toggleable layers (provinces, districts, admin posts, villages, geology)
- Select a province or district and see clipped geological data for that area
- Read tooltips on every feature (name, code, era, period, etc.)
- See geological statistics (area km², percentages, dominant lithology)
- Export the map as HTML, statistics as CSV, and filtered geology as GeoJSON
- Browse scaffolded code stubs for future Sentinel-2 / GEE and ML mineral targeting modules

## User preferences

_Populate as you build._

## Gotchas

- Geometries are simplified at load time — if precision matters, reduce tolerance in `data_loader.py`.
- `geomoz.read_village()` can return a large dataset; villages layer is off by default.
- Area calculation uses UTM 36S (EPSG:32736) — suitable for Mozambique but review for edge zones.
- Column names vary across geomoz releases; `_find_col()` in `data_loader.py` handles fallbacks.

## Future evolution

1. **GEE integration**: `pip install earthengine-api`, then implement `utils/satellite.py`
2. **GeoMoz AI**: `pip install scikit-learn xgboost`, then implement `utils/ml_models.py`
3. **Mineral targeting**: build training data from known deposits + geological features → Random Forest / XGBoost

## Pointers

- See `geomoz-explorer/README.md` for full evolution guide
