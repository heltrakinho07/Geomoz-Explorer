# GeoMoz GIS Workspace — Arquitetura Baseada no GeoLibre

## Decisão

O **GIS Workspace** é um ambiente GIS autónomo e map-centric. O mapa geral do
GeoMoz continua responsável pela exploração territorial e pelos módulos
científicos; o GIS Workspace concentra dados próprios do utilizador,
geoprocessamento, SQL espacial, modelos, resultados e histórico.

Esta arquitetura é inspirada no GeoLibre (MIT), mas adaptada ao stack do GeoMoz
e à infraestrutura Google/Firebase já existente.

## Modelo alvo

```
React GIS Workspace
        |
        +-- GIS project store
        |     +-- layers
        |     +-- groups
        |     +-- map view
        |     +-- selection
        |     +-- processing history
        |     +-- saved models
        |
        +-- MapLibre / Leaflet renderer
        |
        +-- Browser processing
        |     +-- Turf.js
        |     +-- DuckDB-WASM Spatial
        |     +-- Whitebox WASM
        |
        +-- GeoMoz FastAPI / Cloud Run
        |     +-- GDAL / GeoPandas / Rasterio
        |     +-- heavy raster/vector processing
        |     +-- Google Earth Engine adapters
        |
        +-- Persistence
              +-- IndexedDB (offline/local project cache)
              +-- Firestore (project metadata/manifests)
              +-- Firebase Storage / GCS (datasets and outputs)
```

## Persistência

### Browser / offline

A primeira camada de persistência usa IndexedDB. Cada projeto guarda um snapshot
versionado com:

- camadas vetoriais e resultados;
- visibilidade e estilo básico;
- camada ativa e camada secundária;
- histórico de processamento;
- modelos guardados;
- painel/ferramenta ativa;
- basemap.

IndexedDB é usado em vez de `localStorage` porque geodados podem facilmente
ultrapassar alguns megabytes.

### Cloud

A camada cloud deve seguir a separação usada no GeoLibre:

- **Firestore**: manifesto e metadados pequenos;
- **Firebase Storage / GCS**: ficheiros grandes e resultados;
- paths por utilizador/projeto, sem mistura de dados.

Estrutura alvo:

```
users/{uid}/projects/{projectId}
  workspace/manifest
  workspaceLayers/{layerId}
  processingRuns/{runId}
  models/{modelId}

gs://<bucket>/users/{uid}/projects/{projectId}/
  inputs/
  derived/
  rasters/
  vectors/
  exports/
  thumbnails/
```

Dados cloud-native devem preferir GeoParquet, PMTiles, FlatGeobuf e COG para
permitir HTTP Range e evitar a necessidade de publicar tudo num GeoServer.

## Processing

O motor segue uma estratégia híbrida:

1. **Cliente** para operações leves e interativas.
2. **WASM** para DuckDB Spatial, Whitebox e conversões compatíveis.
3. **FastAPI/Cloud Run** para GDAL/Rasterio/GeoPandas e processos grandes.
4. **GEE** para análises planetárias e séries temporais.

Todo resultado vira uma nova camada do mesmo workspace e uma entrada no
histórico de processamento.

## Compatibilidade com GeoLibre

Componentes e ideias que podem ser portados/adaptados:

- store-driven layers;
- Add Data;
- Layer Manager;
- Attribute Table;
- Style Manager;
- DuckDB Spatial SQL Workspace;
- Whitebox Toolbox;
- Processing History;
- Model Builder;
- COG / GeoParquet / PMTiles;
- WMS/WFS/WMTS/XYZ;
- STAC;
- cloud object storage;
- 2D/3D renderers;
- plugin registry;
- AI-assisted processing.

Código reutilizado substancialmente do GeoLibre deve manter os avisos de licença
MIT e atribuição ao projeto original.
