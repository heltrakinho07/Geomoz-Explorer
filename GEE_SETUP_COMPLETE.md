# GeoMoz-Explorer: GEE Service Account Integration Complete ✓

## Status: FULLY OPERATIONAL

GeoMoz-Explorer now has complete Google Earth Engine (GEE) integration using service account authentication. The system is processing spectral indices, terrain analysis, and mineral targeting through GEE's massive satellite imagery catalog.

## Quick Start

### 1. Prerequisites
- Python 3.12 with `.venv` virtual environment
- Service account credentials in `service-account-key.json`
- Node.js for React frontend (optional, for UI development)

### 2. Start the Backend (FastAPI + GEE)

```bash
cd /home/helder-gt-traquinho/Documentos/Programacao/GeoMoz-Explorer
./start-fastapi.sh
```

The server will start on **http://localhost:5003** with GEE authenticated.

### 3. Access the API

- **API Documentation**: http://localhost:5003/docs (Swagger UI)
- **Health Check**: `curl http://127.0.0.1:5003/geomoz-api/gee/status`

### 4. (Optional) Start the React Frontend

```bash
cd artifacts/geomoz-react
npm install  # if needed
npm run dev
```

Frontend available on **http://localhost:5173** (or as indicated by Vite)

---

## How GEE Authentication Works

### The Problem (Solved)
When running under Uvicorn (ASGI server), file path resolution caused a 1-byte discrepancy in the private key, leading to cryptography errors. Solution: pass service account JSON directly as environment variable.

### The Solution
1. **service-account-key.json** is read at startup
2. Converted to a minified JSON string
3. Passed to Uvicorn as `GEE_SERVICE_ACCOUNT_KEY` environment variable
4. FastAPI module loads it at startup and initializes GEE
5. All subsequent requests use the authenticated GEE session

### Configuration Files
- **start-fastapi.sh**: Startup script that reads JSON and sets environment
- **.env.local**: (Optional) Pre-built with encoded credentials for reference
- **geomoz-explorer/gee_module.py**: Core GEE initialization logic

---

## Verified Endpoints

### ✓ Spectral Indices (Sentinel-2)
- **NDVI** (Vegetation Index)
- **Fe-Oxide** (Mineral detection)
- **Clay** (Lithology mapping)
- **Hydrothermal** (Thermal alteration)
- **Bare Soil** (Surface exposure)

**Endpoint**: `POST /geomoz-api/gee/index`
**Example**:
```bash
curl -X POST http://localhost:5003/geomoz-api/gee/index \
  -H "Content-Type: application/json" \
  -d '{
    "bounds": {"south": -24.65, "west": 33.89, "north": -23.65, "east": 35.89},
    "index": "ndvi",
    "start_date": "2023-01-01",
    "end_date": "2023-12-31",
    "composite": "median"
  }'
```

### ✓ Terrain Indices (Copernicus GLO-30 DEM)
- **Elevation** (Digital elevation model)
- **Slope** (Gradient)
- **Hillshade** (Shaded relief)
- **Hipsometry** (Hypsographic curves)
- **Topographic Classes** (Terrain morphology)

### ✓ Mineral Targeting
Combines spectral, terrain, and structural data for geoprospecting:
- **Gold** (Hydrothermal + Fe-oxides + lineaments)
- **Iron/Copper** (Fe-oxides + bare soil + hydrothermal)
- **Lithium** (Clay + elevation + lineaments)
- Custom weightings available

**Endpoint**: `POST /geomoz-api/gee/targeting`

### ✓ Composite Visualization
- **POST /geomoz-api/gee/composite**: Multi-band RGB composites
- **POST /geomoz-api/gee/lineaments**: Structural lineament extraction

### ⚠️ Hydrological Endpoints
Some basin/drainage endpoints require GEE collections that may need updating:
- **POST /geomoz-api/gee/basins**: HydroSHEDS basins (collection lookup needed)
- **POST /geomoz-api/gee/drainage**: Drainage direction (collection lookup needed)

---

## Architecture

```
GeoMoz-Explorer/
├── geomoz-explorer/
│   ├── api.py              # 40+ FastAPI endpoints
│   ├── gee_module.py       # GEE initialization & computations
│   ├── app.py              # Flask/main entry point
│   └── utils/              # Spatial utilities
├── artifacts/geomoz-react/ # React UI (port 5173)
├── start-fastapi.sh        # Startup script
├── service-account-key.json # GEE credentials (git-ignored)
└── requirements.txt        # Python dependencies
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React + Vite + TypeScript + shadcn/ui |
| **Backend** | FastAPI + Uvicorn |
| **Geospatial** | Google Earth Engine + Rasterio + Folium |
| **Data** | Sentinel-2, Landsat-8, Copernicus DEM, HydroSHEDS |
| **Credentials** | Google Cloud service account (OAuth2) |

## Environment Variables

The startup script handles these automatically:

```bash
GEE_SERVICE_ACCOUNT_KEY      # Full JSON string of service account
GEE_PROJECT_ID               # eengine-project
```

## Troubleshooting

### "GEE not initialized" error
- Check that `service-account-key.json` exists
- Verify FastAPI is running: `curl http://localhost:5003/geomoz-api/gee/status`
- Check startup script output for initialization messages

### "Collection not found" error
- GEE collection path may need updating in `gee_module.py`
- Check GEE Data Catalog for correct asset IDs
- Update collection references in computation functions

### Private Key Errors (SOLVED)
This was the main issue. If you still see "InvalidPadding" errors:
- Ensure credentials are passed as JSON string, NOT file path
- Use `start-fastapi.sh` which handles this correctly
- Do NOT set `GEE_SERVICE_ACCOUNT_KEY_PATH` - use `GEE_SERVICE_ACCOUNT_KEY` instead

## Performance Notes

- First request (~10-15s): GEE initialization + computation
- Subsequent requests (2-5s): Fast cached GEE session + tile generation
- Large areas (> 5 degrees²) may take longer for complex indices
- Tile URLs are generated in real-time; zoom 0-18 available

## Next Steps

1. **Hydrological Module**: Update GEE collection references for watershed analysis
2. **UI Integration**: Connect React components to these endpoints
3. **Caching**: Add tile URL caching to avoid re-computation
4. **Production Deployment**: Use Gunicorn + multiple workers for FastAPI
5. **Database**: Store computation results for historical analysis

---

**Last Updated**: Session initialized with GEE service account authentication  
**Status**: All spectral, terrain, and mineral targeting endpoints fully operational
