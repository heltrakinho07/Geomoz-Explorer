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


## Model Builder híbrido

O Model Builder deixa de ser uma lista linear de ferramentas e passa a ser um
grafo dirigido acíclico (DAG) persistente.

### Estrutura

Cada projeto guarda:

```ts
{
  modelNodes: GISModelNode[]
  modelEdges: GISModelEdge[]
}
```

Os nós têm três tipos:

- `input`: referencia uma camada existente do workspace;
- `tool`: referencia um provider e uma ferramenta;
- `output`: materializa um resultado novamente no layer store.

Os providers atualmente executáveis são:

- `turf`: ferramentas vetoriais verificadas do GeoMoz;
- `whitebox`: ferramentas Whitebox WASM vetoriais ou raster.

### Tipos de porta

Cada porta declara `vector`, `raster` ou `any`. Antes da execução o runtime
valida:

- ciclos;
- layers de entrada removidas;
- ferramentas desconhecidas;
- portas obrigatórias sem ligação;
- edges órfãs;
- portas inexistentes;
- duas edges para a mesma entrada;
- incompatibilidade `vector → raster` ou `raster → vector`;
- ausência de nós de saída.

A ordenação é topológica. Uma ferramenta só executa depois de todas as
dependências upstream estarem disponíveis.

### Valores em trânsito

O runtime não transforma dados apenas para atravessar uma edge:

- vetor circula como `FeatureCollection`;
- raster circula como `Uint8Array` GeoTIFF.

Isto permite encadear Whitebox raster sem escrever resultados intermédios no
Firebase e permite encadear Turf/Whitebox vector sem serializações desnecessárias.

### Resolução de inputs raster

Um input raster pode vir de:

- GeoTIFF/COG local;
- Firebase Storage;
- URL COG remoto;
- asset STAC.

Antes de chegar ao Whitebox, o mesmo resolver usado no resto do GIS Workspace
obtém os bytes. Para Planetary Computer, a assinatura SAS é renovada nessa
altura, portanto um modelo guardado não depende de URLs temporárias.

### Materialização de outputs

Um nó `output` grava novamente no workspace:

- `vector` → nova `UserLayer` persistente;
- `raster` → novo GeoTIFF no raster store e, quando o projeto é sincronizado,
  Firebase Storage.

Resultados intermédios permanecem em memória e só são materializados quando uma
saída explícita os recebe.

### Persistência e migração

O schema do workspace é v4. Projetos v1–v3 com o antigo `modelNodes[]` linear
são migrados automaticamente para:

```
Input → Tool 1 → Tool 2 → … → Output
```

Após a migração, nodes e edges passam a ser sincronizados tanto no IndexedDB
como no estado cloud.

### UI

O Model Builder usa um canvas largo no desktop mantendo o mapa visível. A
primeira versão funcional liga portas por seletores de upstream compatíveis e
desenha as edges no canvas. O formato do grafo já suporta futuramente
drag-to-connect, branching visual avançado e execução remota sem nova migração de
dados.


### Backend GDAL no Model Builder

Além de `turf` e `whitebox`, o grafo aceita o provider
`backend-gdal`. Este provider mantém exatamente o mesmo contrato de portas do
Model Builder e executa jobs assíncronos no FastAPI.

Ferramentas disponíveis inicialmente:

- `backend-gdal:hillshade`;
- `backend-gdal:slope`;
- `backend-gdal:aspect`;
- `backend-gdal:cog`.

Todas recebem uma porta raster e devolvem uma porta raster. Durante a execução,
os bytes produzidos pelo nó upstream são enviados ao endpoint de jobs, o
frontend acompanha o estado até `completed`, descarrega o GeoTIFF e entrega os
bytes à próxima edge. O ficheiro só entra no layer store quando alcança um nó
`output`.

Como o provider é apenas mais um adapter do grafo, esta extensão não exige nova
versão do schema do Workspace.


## Limites operacionais do backend GDAL

O GeoMoz oferece GDAL remoto para Hillshade, Slope, Aspect e conversão COG.
A API recebe GeoTIFF/COG em blocos de 1 MiB, valida a assinatura TIFF/BigTIFF,
limita a dimensão do upload e cria um job isolado por UID Firebase verificado.

Parâmetros configuráveis do processo FastAPI:

| Variável | Default | Propósito |
| --- | --- | --- |
| `GEOMOZ_JOB_MAX_UPLOAD_BYTES` | 268435456 (256 MiB) | Limite máximo por GeoTIFF |
| `GEOMOZ_JOB_WORKERS` | 2 | Subprocessos GDAL concorrentes |
| `GEOMOZ_JOB_MAX_ACTIVE_GLOBAL` | 4 | Tarefas ativas em fila/executadas |
| `GEOMOZ_JOB_MAX_ACTIVE_PER_USER` | 2 | Isolamento de recursos por utilizador |
| `GEOMOZ_JOB_MAX_TIMEOUT_SECONDS` | 1800 | Limite absoluto de execução |
| `GEOMOZ_JOB_TTL_SECONDS` | 7200 | Retenção de resultados terminados |
| `GEOMOZ_JOB_ROOT` | `/tmp/geomoz-processing-jobs` | Armazenamento temporário |

O `DELETE /geomoz-api/processing/jobs/{id}` cancela subprocessos em curso.
Ficheiros temporários só são eliminados depois do processo terminar.
Jobs ativos não expiram automaticamente por TTL.

**Limitação de produção:** a fila e os resultados atuais residem no
filesystem/memória de **uma instância FastAPI**. Não constituem uma fila
distribuída; podem desaparecer em restart, deploy ou encaminhamento para outra
réplica. Em Cloud Run, execução assíncrona pós-resposta também depende da
disponibilidade de CPU. Para garantir execução durável em escala, será
necessário usar Cloud Storage + uma fila durável/Cloud Run Jobs + Firestore
para estados e autorização por utilizador. Não apresentar os jobs atuais
como duráveis ou distribuídos.


## Autenticação e isolamento das credenciais Earth Engine

**Firebase Auth (GeoMoz) e Google Earth Engine (GEE) são autorizações distintas.**
Entrar com uma conta Google na aplicação não concede automaticamente acesso GEE.
Cada utilizador autenticado deve introduzir o **seu Google Cloud project ID**
e autorizar explicitamente GEE através de OAuth ou da própria conta de serviço.

- O backend verifica a assinatura do ID token Firebase com Admin SDK e obtém o UID.
- Os projetos, workspaces e ficheiros ficam em `users/{uid}/projects/{projectId}`.
- Os dados do IndexedDB são separados por `{uid}::{projectId}`;
  não são carregados por outro utilizador que partilhe o mesmo browser.
- Tokens OAuth, refresh tokens e chaves de contas de serviço ficam apenas no
  documento `geePrivateSessions/{uid}`, acessível pelo Firebase Admin SDK.
- As regras Firestore negam acesso client-side à coleção privada e impedem
  armazenar campos secretos em `users/{uid}/settings/gee`.
- A migração do formato antigo é executada no primeiro acesso autenticado:
  copia as credenciais existentes para a coleção privada e remove os campos
  secretos de `settings/gee`. Documentos antigos nunca acedidos devem ser
  tratados por uma migração administrativa separada.
- O backend **não usa GEE_SERVICE_ACCOUNT_KEY, credenciais do contentor,
  ADC ou a quota da plataforma como fallback** para uma conta sem credenciais
  pessoais. Até mesmo o modo convidado precisa autenticar-se antes de usar GEE.
- Não aceitar `X-GEE-Token` como substituto das credenciais privadas do UID.
- O SDK `ee.Initialize` partilha estado global no processo. Todos os endpoints
  `/geomoz-api/gee/*` são serializados por um lock assíncrono que cobre
  autenticação e execução; cache de imagens é limpo na troca de UID.

**Limitação:** o isolamento no mesmo processo através do lock é conservador
e pode reduzir a concorrência. Uma arquitetura futura de workers/processos
por utilizador ou jobs isolados é recomendada para maior escala. A proteção
Firestore depende da publicação efetiva das regras no projeto Firebase.

**Operação e migração:** revogar tokens/chaves expostos se houver suspeita de
compromisso; eliminar dados locais legados, incluindo qualquer
`.gee_sessions.json` histórico, após migração verificada. Nunca fazer commit
de chaves de conta de serviço ou refresh tokens. OAuth com código de autorização
é preferível a chaves JSON distribuídas.

**Configuração:** o OAuth Code Flow backend exige `GOOGLE_CLIENT_ID` e,
para clientes OAuth do tipo Web Application, `GOOGLE_CLIENT_SECRET` em
Secret Manager/ambiente do backend. Não configurar estas credenciais no
bundle do frontend. O front só recebe o ID público do cliente OAuth.
