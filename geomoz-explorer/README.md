# GeoMoz Explorer

WebGIS platform for visualising and analysing geospatial data of Mozambique.

## Quick start

```bash
cd geomoz-explorer
pip install -r requirements.txt
streamlit run app.py
```

## Project structure

```
geomoz-explorer/
├── app.py               # Main Streamlit application
├── requirements.txt     # Python dependencies
├── .streamlit/
│   └── config.toml      # Streamlit server config (port 5000)
├── utils/
│   ├── data_loader.py   # Cached GeoMoz data loading & filtering
│   ├── mapping.py       # Folium map building & layer helpers
│   ├── analysis.py      # Geological statistics & area calculations
│   └── export.py        # HTML / CSV / GeoJSON export helpers
└── outputs/             # Output files (maps, CSVs, GeoJSON)
```

## Available layers (via geomoz)

| Layer | Function |
|---|---|
| Províncias | `geomoz.read_province()` |
| Distritos | `geomoz.read_district()` |
| Postos Administrativos | `geomoz.read_admin_post()` |
| Aldeias | `geomoz.read_village()` |
| Geologia | `geomoz.read_geology()` |

## Evolving the MVP

### 1 — Google Earth Engine integration

```bash
pip install earthengine-api
earthengine authenticate
```

Then implement `utils/satellite.py` using the skeleton code in the
"Satellite Analysis" tab of the app.

### 2 — GeoMoz AI (machine learning)

```bash
pip install scikit-learn xgboost
```

Then implement `utils/ml_models.py` using the skeleton in the
"GeoMoz AI" tab. You will need training data (known mineral deposits)
as positive labels.

### 3 — Mineral targeting workflow

1. Prepare feature matrix from geological columns (`ERA`, `PERIOD`, `code2006`, area, etc.)
2. Collect known deposit locations as positive labels
3. Train a Random Forest or XGBoost classifier
4. Predict favourability scores across all geological units
5. Visualise as a choropleth layer in Folium
