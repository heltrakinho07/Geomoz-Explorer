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


## Data Sources e camadas remotas

O GIS Workspace mantém três classes de dados no mesmo projeto:

| Classe | Exemplos | Persistência | Renderização / processamento |
|---|---|---|---|
| Vetor materializado | GeoJSON, CSV, KML, GPKG, GeoParquet, FGB, Shapefile, WFS, OGC API Features | GeoJSON no cache/Storage + manifesto Firestore | MapLibre GeoJSON, Turf, DuckDB Spatial, Whitebox vector |
| Raster | GeoTIFF/COG local, COG URL, assets STAC | ficheiro local/Storage ou identidade remota + manifesto | maplibre-gl-raster / cog-tiler-wasm, estatísticas, simbologia, Whitebox raster |
| Serviço/archive remoto | WMS, WMTS, XYZ, PMTiles | definição pequena no estado do projeto | MapLibre tiles/protocolos por HTTP Range |

### Fontes suportadas no painel Data Sources

- ficheiros locais vetoriais e GeoTIFF/COG;
- GeoJSON por URL;
- WFS GetCapabilities + GetFeature;
- OGC API - Features com paginação e filtro pela AOI;
- WMS GetCapabilities + descoberta de layer/style;
- WMTS GetCapabilities + descoberta de TileMatrixSet;
- XYZ e WMTS REST templates;
- STAC API genérico, com Planetary Computer e Earth Search como presets;
- PMTiles remoto, raster ou vector, via HTTP Range;
- COG/GeoTIFF remoto via HTTP Range.

### STAC e credenciais temporárias

Um raster STAC guarda no projeto a identidade estável do asset:

```
catalogUrl
collectionId
itemId
assetKey
href original
```

URLs SAS temporárias **não** são persistidas. Para assets do Microsoft Planetary
Computer, o GeoMoz solicita/renova a assinatura quando o raster precisa ser
renderizado, inspecionado ou enviado ao Whitebox WASM. Isso evita projetos
quebrados depois da expiração de uma credencial.

### Serviços OGC e tiles

WMS/WMTS/XYZ são guardados como definições declarativas pequenas no manifesto do
workspace. O MapLibre é um renderer desse estado, não a fonte de verdade. Assim:

- ocultar, alterar opacidade ou remover atualiza o projeto;
- recarregar o browser restaura os serviços;
- sincronização cloud restaura as mesmas fontes noutro dispositivo;
- nenhum tile é copiado para Firestore ou Firebase Storage.

PMTiles segue o mesmo modelo, mas usa o protocolo `pmtiles://` e Range Requests
para ler apenas header, metadata e tiles necessários. Vector PMTiles usa as
`vector_layers` anunciadas pelo archive; raster PMTiles é desenhado como raster
source.

### Separação de responsabilidades

O separador **Data Sources** é o único ponto de entrada para adicionar dados.
O separador **Camadas** gere visibilidade, opacidade, simbologia, atributos,
remoção e ações de processamento das fontes já adicionadas. Esta separação evita
duplicação de formulários e mantém o GIS Workspace próximo do fluxo de um desktop
GIS moderno.
